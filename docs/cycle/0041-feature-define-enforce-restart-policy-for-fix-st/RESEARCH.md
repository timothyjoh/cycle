Emitting RESEARCH.md to stdout below.

```markdown
# Research: Cycle 0041

## Cycle Context
SPEC chose Option 2 (hard reset) for `fix`-step restart tolerance, mirroring the `build`-step Policy 1 shipped in cycle 0040. Generalize the per-step pre-SHA finder + capture/reset gate so both `build` and `fix` capture `head_sha` on fresh `step.start` and hard-reset the cycle branch on resume entry. Add matching `fix_pre_sha_missing` / `fix_pre_sha_unreachable` self-healing warnings, `no_branch: true` skip parity, full test matrix, and rewrite the CLAUDE.md "Build-step restart policy" paragraph into a unified "Restart policy (hard reset to pre-step HEAD)" entry naming both reset-eligible steps and all four warning reasons.

## Current Codebase State

### Relevant Components
- Per-step pre-SHA finder (build-only today): `findPriorBuildHeadSha(repoRoot, cycleId): Promise<string | null | "missing">` — `src/engine/run-cycle.ts:22-41`. Reads `.cycle/log.jsonl`, scans backwards, matches `event === "step.start" && step === "build" && cycle_id === cycleId`, returns `head_sha` string when present, `"missing"` when the matching row lacks the field, `null` when no row matches or the file is unreadable.
- Capture/reset gate (build-only today): `src/engine/run-cycle.ts:94-114`. Inside the workflow step loop, computes `isBuild = step.name === "build"` and `isResumeEntry = !!opts.resume && i === startIdx`, then gates SHA capture behind `if (isBuild && !wf.no_branch)`. Fresh-entry branch sets `headSha = revParseHead(...)`. Resume-entry branch calls `findPriorBuildHeadSha`, maps `null`/`"missing"` → `step.warning {reason:"build_pre_sha_missing"}` + `revParseHead`, `!shaExists` → `step.warning {reason:"build_pre_sha_unreachable", sha:prior}` + `revParseHead`, otherwise `resetCycleBranchTo(prior)` + `headSha = prior`.
- `step.start` emission with conditional `head_sha`: `src/engine/run-cycle.ts:116-121`. Spreads `...(headSha ? { head_sha: headSha } : {})` so non-build / `no_branch` / non-reset paths simply omit the field.
- Workflow step loop entry: `src/engine/run-cycle.ts:90-92` (`startIdx = opts.resume?.startStepIndex ?? 0; for (let i = startIdx; i < wf.steps.length; i++)`). The `fix` step lives at index 5 of the feature workflow (`spec, research, plan, build, review, fix, verify, commit, pr, reflection`).
- Resume entry plumbing: `runCycle` opts at `src/engine/run-cycle.ts:43-50` (`resume?: { startStepIndex: number }`); `cycle.resume` emission at lines 60-66; `wf.no_branch` branch on resume at lines 67-71 (`prepareTrunkArtifactDir` vs `checkoutCycleBranch`).
- Workflow type & loader: `src/engine/workflow.ts:5-19` defines `Step` (`name`, `agent`, `prompt?`, `command?`, `skip_unless?`) and `Workflow` (with `no_branch?: boolean`). `loadConfig` parses `.cycle/workflows.yml`; `loadWorkflow` returns the named workflow.
- Branch primitives (all shipped in cycle 0040, ready for reuse):
  - `currentBranchName(repoRoot): Promise<string | null>` — `src/engine/branch.ts:82-90`.
  - `revParseHead(repoRoot): Promise<string | null>` — `src/engine/branch.ts:92-94`.
  - `resetCycleBranchTo(repoRoot, sha): Promise<void>` — `src/engine/branch.ts:96-102`. Guarded: throws unless `currentBranchName(...)` starts with `cycle/`.
  - `shaExists(repoRoot, sha): Promise<boolean>` — `src/engine/branch.ts:104-110`. Uses `git cat-file -e <sha>^{commit}`.
- Append-only logger: `createLogger(repoRoot, sink?)` — `src/engine/log.ts:8-18`. Each `emit(event, fields)` writes one JSONL line with `ts`, `event`, and the supplied fields.
- Log-tail resume reader: `src/engine/log-tail.ts:1-107`. `parseLogTail` computes `completedSteps` from `step.end status:"ok"` events; resume `startStepIndex` (computed in `cli.ts`, not here) is the index of the first workflow step name not in that list.

### Existing Patterns to Follow
- Build-step capture/reset gate, lines `src/engine/run-cycle.ts:94-114`. Pattern: derive `isBuild`/`isResumeEntry` once, gate the entire block on `isBuild && !wf.no_branch`, branch fresh vs resume, set `headSha` for the subsequent `step.start` spread. Generalize by widening the gate predicate from `step.name === "build"` to `step.name === "build" || step.name === "fix"` (or a `RESET_ELIGIBLE_STEPS` set). The warning `reason` strings and `step` field on `step.warning` are derived from `step.name` so the build path stays bit-for-bit identical when `step.name === "build"`.
- `findPriorBuildHeadSha` shape (`src/engine/run-cycle.ts:22-41`). Tri-valued return `string | null | "missing"`: SHA when the matching row carries `head_sha`, `"missing"` when the matching row has no `head_sha`, `null` when no matching row exists or the log file is unreadable. Generalization is mechanical: replace the hard-coded `ev.step !== "build"` predicate with a `stepName` parameter, rename to `findPriorStepHeadSha(repoRoot, cycleId, stepName)`. Existing callers and tests refer to `findPriorBuildHeadSha`; preserve that name via either rename + wrapper or rename + call-site updates (test imports at `tests/engine/run-cycle.test.ts:7,644-702` must keep working — either keep the old export as a thin wrapper or update the tests).
- `step.warning` event shape: `{ cycle_id, step, reason, [sha] }`. The `sha` field is only present on the `_unreachable` variant. Build-path examples at `src/engine/run-cycle.ts:104,107`.
- Self-healing re-emit: on both warning paths, `headSha = await revParseHead(repoRoot)` and the subsequent `step.start` carries `head_sha = currentHead`, so the next resume can either reset or warn — never null-pointer through the resume path.
- `no_branch` skip pattern: the entire capture/reset block is gated `&& !wf.no_branch`. `step.start` then omits `head_sha` (spread elides the field) and no reset is attempted. Mirror this for `fix`.
- Test fixture pattern: `tests/engine/run-cycle.test.ts:15-28` `workflowYml(stepsBody)` template helper produces a complete `workflows.yml` with `engine`, `triage`, and a single `feature` workflow. Tests use `mkdtemp` + `git init -b main` + a private `bin` dir with a stub `claude` shell script, then drive `runCycle` with `env: { PATH: ${bin}:..., CYCLE_BASE: "main" }`. Resume tests seed `.cycle/log.jsonl` manually with crafted `cycle.start` + `step.start`/`step.end` rows, pre-create the cycle branch, then call `runCycle` with `resume: { startStepIndex: N }`. The `no_branch: true` test (lines 750-827) hand-rolls the YAML rather than reusing `workflowYml`.

### Dependencies & Integration Points
- `src/engine/run-cycle.ts` imports `revParseHead`, `resetCycleBranchTo`, `shaExists`, `currentBranchName` from `./branch.ts` — all already in scope; no new primitives needed.
- `src/engine/branch.ts` shipped four primitives in cycle 0040 (`currentBranchName`, `revParseHead`, `resetCycleBranchTo`, `shaExists`). No changes required for this cycle.
- `src/engine/log.ts` is append-only JSONL with no schema validation — adding a new event reason needs no parser changes.
- Workflow definition: feature workflow's `fix` step lives at `src/defaults/workflows.yml:20` and `.cycle/workflows.yml:27`. Both carry `skip_unless: MUST-FIX.md` — see Open Questions.
- `src/defaults/prompts/fix.md` is the `fix` agent prompt; per SPEC it remains unchanged (hard reset means the agent always sees a clean branch).
- CLAUDE.md "Build-step restart policy" paragraph lives at `CLAUDE.md:53` (one bullet under the "Architecture quick reference" list, sandwiched between "Resume from log tail" and the "Subprocess discipline" heading). It must be rewritten in this cycle to cover both `build` and `fix` plus all four warning reasons.
- After editing `src/defaults/`, `npm run sync-defaults` copies into `.cycle/` so the dogfooded engine reads the change. For this cycle, `src/defaults/prompts/fix.md` is unchanged and `src/defaults/workflows.yml` is unchanged, so no sync is required unless an editor touches them.

### Test Infrastructure
- Framework: Node's native test runner (`node --test`) with spec reporter, invoked via `npm test`. Auto-builds `dist/cycle.js` via the `pretest` script.
- Conventions: tests live at `tests/<area>/<name>.test.ts`; one file per source module is the dominant pattern (e.g. `tests/engine/run-cycle.test.ts` mirrors `src/engine/run-cycle.ts`). Async tests use `mkdtemp` for tmp dirs and `rm({recursive:true, force:true})` in `finally`. No mocking framework — tests use real `git` against ephemeral repos and stub `claude` binaries on a private `PATH`.
- Build-step restart coverage already in `tests/engine/run-cycle.test.ts`:
  - `findPriorBuildHeadSha: returns null when .cycle/log.jsonl is missing` (line 644)
  - `findPriorBuildHeadSha: returns 'missing' when prior build step.start has no head_sha` (line 654)
  - `findPriorBuildHeadSha: returns the SHA when present and skips garbage lines` (line 669)
  - `findPriorBuildHeadSha: returns null when no matching build step.start exists for cycle` (line 688)
  - `fresh build step.start records head_sha; non-build step.start does not` (line 704)
  - `no_branch workflow: build step.start omits head_sha (fresh + resume)` (line 750)
  - `resume at build hard-resets to prior step.start head_sha` (line 829)
  - `resume at build with no prior head_sha emits build_pre_sha_missing and skips reset` (line 917)
  - `resume at build with unreachable head_sha emits build_pre_sha_unreachable and skips reset` (line 984)
- `tests/engine/branch.test.ts` covers `currentBranchName`, `revParseHead`, `resetCycleBranchTo`, `shaExists` with happy + guard + spawn-error paths (`branch.test.ts:203,232,258,292,311,323,330,346`).
- Coverage policy from `CLAUDE.md`: `npm run test:coverage` must hold line ≥ 95%, branch ≥ 75%, function ≥ 90%. Build-step coverage was reported in cycle 0040; this cycle's fix-step tests must keep those thresholds.

## Code References
- `src/engine/run-cycle.ts:22-41` — `findPriorBuildHeadSha` definition; tri-valued return; generalization target.
- `src/engine/run-cycle.ts:90-92` — workflow step loop entry; `startIdx` defaults to 0 or `resume.startStepIndex`.
- `src/engine/run-cycle.ts:94-114` — capture/reset gate, predicate `isBuild && !wf.no_branch`; this is the single block to widen from `build` to `{build, fix}`.
- `src/engine/run-cycle.ts:116-121` — `step.start` emit with conditional `head_sha` spread.
- `src/engine/branch.ts:82-94` — `currentBranchName`, `revParseHead`.
- `src/engine/branch.ts:96-102` — `resetCycleBranchTo` with cycle-branch guard.
- `src/engine/branch.ts:104-110` — `shaExists`.
- `src/engine/workflow.ts:5-19` — `Step` and `Workflow` types; `no_branch?: boolean`; `skip_unless?: string` (declared but never consumed by engine code, see Open Questions).
- `src/engine/log.ts:8-18` — append-only JSONL logger; no schema validation.
- `src/defaults/workflows.yml:14-24` — feature workflow step list; `fix` at line 20 with `skip_unless: MUST-FIX.md`.
- `src/defaults/prompts/fix.md:1-72` — `fix` agent prompt; unchanged this cycle.
- `tests/engine/run-cycle.test.ts:7` — `findPriorBuildHeadSha` import from `src/engine/run-cycle.ts`; rename/wrapper choice must keep this passing.
- `tests/engine/run-cycle.test.ts:15-28` — `workflowYml` template helper for fixture YAML.
- `tests/engine/run-cycle.test.ts:644-1050` — full build-step restart test suite (the model the fix-step suite must mirror).
- `CLAUDE.md:53` — "Build-step restart policy (Policy 1, hard reset to pre-`build` HEAD)" paragraph; must be rewritten as the unified "Restart policy" entry covering `build` + `fix` + four warning reasons + `no_branch` skip + the unchanged non-reset step list (`spec`, `research`, `plan`, `review`, `verify`, `commit`, `pr`, `reflection`).

## Open Questions
- **`fix` step's `skip_unless: MUST-FIX.md`.** The `Step` type declares `skip_unless?: string` (`src/engine/workflow.ts:10`), but a `grep skip_unless src tests` confirms the engine never consumes it — `run-cycle.ts` runs every step in `wf.steps` unconditionally. Documented in `docs/cycle/0013-feature-bb-2-consolidate-workflow-engine-triage/RESEARCH.md:25` ("must round-trip through the loader as data … no engine code branches on it today") and recurring evidence in cycles 0002/0005/0007/0010/0019/0030/0031 FIX.md ("Fix step ran due to engine not honoring `skip_unless`"). For Policy 1 generalization the planner needs to decide: does the gate predicate `step.name === "fix"` always trigger SHA capture when the step appears in the workflow (which matches today's actual engine behavior — `fix` always runs), or should it predicate on whether the step will actually do work (which would couple Policy 1 to an unimplemented skip-logic)? SPEC implies the former (capture whenever `fix` is in the loop).
- **Generalization shape: rename vs wrapper.** `findPriorBuildHeadSha` is exported and imported by `tests/engine/run-cycle.test.ts:7`. Plan must pick: (a) rename to `findPriorStepHeadSha(repoRoot, cycleId, stepName)` and update the four call sites in the test file, or (b) keep `findPriorBuildHeadSha` as a thin wrapper around the new `findPriorStepHeadSha(..., "build")` so the existing test imports and bit-for-bit assertions stay untouched. SPEC line 37 explicitly allows either ("via rename + thin wrapper or by replacing internal call sites"). This is a planner decision, not a research finding.
- **Build-test regression scope.** Existing build-step tests assert exact event shapes (e.g. `"event":"step.warning","cycle_id":"0042","step":"build","reason":"build_pre_sha_missing"`). Plan must confirm the generalized code path emits `step` from `step.name` and the reason prefix from the step name (so `build` → `build_pre_sha_*`, `fix` → `fix_pre_sha_*`) — otherwise the existing assertions silently flip to `step_pre_sha_*` and the regression check at SPEC AC line 43 fails.
- **`fix` resume + `no_branch`.** The current `no_branch: true` build-step test (lines 750-827) seeds an actual fresh `runCycle` rather than a hand-crafted log; the `fix`-step counterpart will need either (a) the same shape — drive a fresh trunk cycle that lands on `fix` and assert `head_sha` is absent, then a resumed cycle that asserts no warning and no reset — or (b) a hand-crafted log-tail. Planner should call out which.
```
