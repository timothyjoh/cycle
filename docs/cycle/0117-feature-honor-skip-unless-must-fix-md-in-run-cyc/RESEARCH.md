```markdown
# Research: Cycle 0117

## Cycle Context

`workflows.yml` declares `fix` (and `e2e-tests` `fix`) with `skip_unless: MUST-FIX.md`. `src/engine/workflow.ts` parses that field into `Step.skip_unless?: string`, but `src/engine/run-cycle.ts` never reads it — the `fix` agent always spawns, producing a no-op `FIX.md` on clean-review cycles. This cycle wires `skip_unless` into `run-cycle.ts` (emit `step.end {status: "skipped"}` and skip agent when artifact absent) and adds one branch to `src/engine/log-tail.ts` so resume treats `step.end {status: "skipped"}` as completed.

---

## Current Codebase State

### Relevant Components

- **`Step.skip_unless` type field** — `src/engine/workflow.ts:10` — optional `string`, parsed from YAML but unused downstream
- **`SKIP_ELIGIBLE_STEPS` set** — `src/engine/run-cycle.ts:30` — `{"spec","research","plan"}`; guards the existing artifact-based retry-skip path; `fix` is NOT in this set
- **`RESET_ELIGIBLE_STEPS` set** — `src/engine/run-cycle.ts:24` — `{"build","fix"}`; triggers `head_sha` capture and hard-reset on resume for worktree-pr mode
- **`shouldSkipForArtifact`** — `src/engine/run-cycle.ts:32–45` — checks `SKIP_ELIGIBLE_STEPS`, then `stat`s `<artifactDir>/<STEP>.md`; returns `{skip: true, artifactPath}` or `{skip: false}`. Unrelated to `skip_unless`.
- **Step loop in `runCycle`** — `src/engine/run-cycle.ts:140–236`:
  1. Line 147–158: retry-skip check (calls `shouldSkipForArtifact`), emits `step.skipped` event
  2. Line 160–176: reset-eligible head_sha capture (worktree-pr only)
  3. Line 178–183: emits `step.start`
  4. Lines 185–214: agent dispatch (bash or claudecode)
  5. Lines 215–223: emits `step.end {status, exit_code, ...}`
- **`artifactDir`** — `src/engine/run-cycle.ts:105–126` — resolved to `docs/cycle/<cycleId>-<workflow>-<slug>/` via `prepareTrunkArtifactDir` or `checkoutCycleBranch`/`createCycleBranch`
- **`parseLogTail`** — `src/engine/log-tail.ts:48–62` — collects `completedSteps` by scanning after `cycle.start`:
  - `step.end` with `status === "ok"` → adds step name (line 52–53)
  - `step.skipped` event → adds step name (line 54–55)
  - `step.end` with `status === "skipped"` → **NOT handled** (falls through to `continue`)
- **`InFlightCycle.completedSteps`** — `src/engine/log-tail.ts:7` — string array fed to resume logic in `cli.ts`
- **Resume step selection** — `src/cli.ts:223–230` — walks `wfDef.steps`, finds first step name NOT in `tail.completedSteps`, sets `startStepIndex`

### workflows.yml declarations

- Feature `fix` step — `.cycle/workflows.yml:28` — `skip_unless: MUST-FIX.md`
- `e2e-tests` `fix` step — `.cycle/workflows.yml:60` — `skip_unless: MUST-FIX.md`
- `src/defaults/workflows.yml` — mirrors these two declarations (planner should verify sync)

### Existing Patterns to Follow

- **`step.skipped` event shape** (existing retry-skip, `run-cycle.ts:150–156`):
  ```json
  {"event":"step.skipped","cycle_id":"...","step":"...","reason":"artifact_present","artifact_path":"..."}
  ```
  New `step.end {status:"skipped"}` is a **different** event shape per the AC — `step.end` not `step.skipped`.

- **`step.end` event shape** (`run-cycle.ts:215–223`):
  ```json
  {"event":"step.end","cycle_id":"...","step":"...","status":"ok|failed","exit_code":N}
  ```
  New status value `"skipped"` slots into the existing `status` field.

- **AC-specified skipped event payload** (issue:23):
  ```json
  {"step":"<name>","reason":"skip_unless_artifact_missing","artifact":"<name>"}
  ```
  Combined with the standard `step.end` envelope.

- **Artifact path derivation**: existing `shouldSkipForArtifact` derives artifact name as `${stepName.toUpperCase()}.md`. The `skip_unless` field is the **literal filename** (e.g. `"MUST-FIX.md"`), joined directly with `artifactDir` — no derivation.

- **`stat` existence check pattern** — `run-cycle.ts:39–43` — `stat(path)` catches ENOENT; `st.isFile() && st.size > 0` gates the skip. The `skip_unless` check only needs file existence (any size ≥ 0 qualifies), per the AC ("artifact is present").

- **Test file naming convention**: `tests/engine/run-cycle.<feature>.test.ts` (e.g. `run-cycle.skip-completed.test.ts`, `run-cycle.spec-guard.test.ts`)

- **Test repo setup pattern** (`run-cycle.skip-completed.test.ts:49–77`): `mkdtemp` for root + bin, `git init -b main`, fake `claude` binary via `chmod 0o755`, seed artifact files, pass `env: { PATH: \`${bin}:${process.env.PATH}\`, CYCLE_BASE: "main" }`

- **Fake claude "fail if invoked" pattern** (`run-cycle.skip-completed.test.ts:169–171`):
  ```bash
  #!/bin/bash\necho "should not run" >&2\nexit 1
  ```
  Used to assert agent was not spawned.

- **Log assertion pattern**: `readFile(join(root, ".cycle/log.jsonl"), "utf8")` then `assert.match(log, /regex/)` / `assert.doesNotMatch`.

### Dependencies & Integration Points

- `src/engine/workflow.ts:10` → provides `Step.skip_unless?: string` already
- `src/engine/run-cycle.ts` → sole location needing the skip predicate; imports `stat` from `node:fs/promises` already (line 21)
- `src/engine/log-tail.ts:48–62` → one new `else if` branch for `step.end` + `status === "skipped"`
- `cli.ts:223–230` → no changes needed; resume step selection depends on `completedSteps` which `log-tail.ts` populates
- **No changes needed to `SKIP_ELIGIBLE_STEPS`** — per SPEC out-of-scope note
- **No changes needed to `RESET_ELIGIBLE_STEPS`** — skipped steps never reach the head_sha capture block (check fires before it)

### Test Infrastructure

- **Framework**: Node.js native test runner (`node:test`), `node:assert/strict`
- **Test directory**: `tests/engine/` for engine unit/integration tests
- **Target new test file**: `tests/engine/run-cycle.skip-unless.test.ts` (per SPEC)
- **Coverage gate**: `scripts/coverage-gate.mjs` — no floor currently set for `src/engine/run-cycle.ts` or `src/engine/log-tail.ts`; aggregate floors are Line ≥ 95%, Branch ≥ 75%, Func ≥ 90%
- **Existing `log-tail.ts` tests**: `tests/engine/log-tail.test.ts` — covers `step.skipped` event handling (line 54 path) implicitly via `completedSteps` assertions; the `step.end {status:"skipped"}` branch will need a new test case there

## Code References

- `src/engine/workflow.ts:10` — `skip_unless?: string` in `Step` type
- `src/engine/run-cycle.ts:24` — `RESET_ELIGIBLE_STEPS`
- `src/engine/run-cycle.ts:30` — `SKIP_ELIGIBLE_STEPS`
- `src/engine/run-cycle.ts:32–45` — `shouldSkipForArtifact` (existing retry-skip helper; DO NOT modify)
- `src/engine/run-cycle.ts:140–236` — step loop; new check inserts between line 158 and line 160
- `src/engine/run-cycle.ts:21` — `stat` already imported
- `src/engine/log-tail.ts:48–62` — `completedSteps` collection; needs new `else if` at line 54 for `step.end`+`status:"skipped"`
- `src/cli.ts:223–230` — resume `startStepIndex` selection; no changes needed
- `.cycle/workflows.yml:28` — `fix` step with `skip_unless: MUST-FIX.md`
- `.cycle/workflows.yml:60` — `e2e-tests fix` step with `skip_unless: MUST-FIX.md`
- `tests/engine/run-cycle.skip-completed.test.ts:49–77` — canonical test repo setup pattern to replicate
- `tests/engine/log-tail.test.ts:41–52` — `completedSteps` assertion pattern for new branch test

## Open Questions

1. **`step.end` without preceding `step.start`**: The AC specifies no `step.start` for skipped steps. The log-tail `lastStepStarted` computation (`log-tail.ts:63–86`) scans for `step.start` events with no matching `step.end` — a skipped step emitting `step.end` without `step.start` could be parsed by `lastStepStarted` logic (the inner loop looks for `step.end` matching the started step; a bare `step.end` would never be found by this scanner since there's no `step.start` to trigger it). Planner should confirm this is safe or note it explicitly.

2. **Resume path: does `skip_unless` re-evaluate on resume?** The AC says "engine.resume re-reads log, sees `fix` already `skipped`, advances to `verify` without re-evaluating the predicate." This means the `completedSteps` path in `log-tail.ts` handles it — but the planner should confirm that a resumed cycle where `fix` was skipped will correctly show `fix` in `completedSteps` and skip it at the `startStepIndex` selection stage, not re-run the `skip_unless` predicate.

3. **`stat` size check**: `shouldSkipForArtifact` requires `size > 0`. The AC says "artifact is present" — should a zero-byte `MUST-FIX.md` count as present and trigger the `fix` step? The issue only says "absent" triggers the skip; the planner should decide whether zero-byte counts as absent.
```
