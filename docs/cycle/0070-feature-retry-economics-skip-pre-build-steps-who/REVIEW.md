```markdown
# Review: Cycle 0070

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

The implementation matches the SPEC's narrow contract (5+1 unit-test
matrix passes, types correct, log-tail recognition works, opt-out
threads end-to-end) but the SPEC itself misses a load-bearing
assumption about cycle_id reuse. The skip gate cannot fire under the
real `tbd.jsonl` fresh-pop retry path because `drainFailedRetry`
deletes `cycle_id` and the next pop allocates a fresh one, yielding a
fresh empty `artifactDir`. The unit tests pass because they manually
seed the artifactDir under the same literal `cycleId` they then pass
to `runCycle` — bypassing the CLI flow. Three documentation claims
describing the feature are correspondingly unbacked by observable
production behavior.

## Code Quality Review

### Summary
The mechanical work is clean: types extended, helper extracted, gate
placed before the reset block, log-tail accumulator extended,
opt-out plumbed CLI→YAML with CLI-wins precedence and surfaced on
`engine.start`. PLAN.md was followed task-by-task. The defect is at
the design-vs-flow seam, not in the code that was written.

### Findings
1. **Feature non-functional in primary use case**: `runCycle` skip
   gate inspects `docs/cycle/<cycleId>-<workflow>-<slug>/<STEP>.md`,
   but the CLI's fresh-pop retry path allocates a new `cycleId` per
   attempt — `src/cli.ts:402`, gated by `drainFailedRetry`'s
   `delete r.cycle_id` at `src/engine/queue.ts:167`. The skip gate
   at `src/engine/run-cycle.ts:143-153` therefore never sees the
   prior attempt's artifacts during a real retry. See MUST-FIX
   Task 1.
2. **Resume path skip semantics rarely engage**: the gate is
   self-suppressed at `i === startIdx` (`src/engine/run-cycle.ts:141, 143`).
   On resume, `startStepIndex` already points past all completed
   steps, so the loop body executes only for steps that did NOT
   complete in the prior run. In practice this means the
   `attempt > 0` predicate combined with `!isResumeEntry` matches
   only contrived scenarios (e.g. a same-`cycleId` resume that
   re-enters at step 0 with no completed steps). Not a bug, but it
   underscores that the unit-test seams don't reflect the actual
   production flow.
3. **`headSha` / `isResetEligible` declared above the skip gate**:
   minor — they're computed even when the loop will `continue`. No
   correctness issue (`headSha` stays `null`, `isResetEligible` is
   pure), but the cleaner placement is inside the post-gate block.
   Not worth a fix on its own. — `src/engine/run-cycle.ts:139-141`
4. **`engine.start` emit moved after `materializeFreeformIssue`**:
   intentional (BUILD.md), to capture the resolved
   `skip_completed_on_retry` boolean. No tests assert ordering
   between `materializeFreeformIssue` and `engine.start`, so this is
   safe. Worth a one-line comment on `src/cli.ts:90-93` noting that
   the emit was deliberately moved after `loadConfig` for payload
   completeness. — `src/cli.ts:75-93`

### Spec Compliance Checklist
- [x] Skip gate predicate exactly matches SPEC: `attempt > 0 &&
      skipEnabled && !isResumeEntry && step.agent !== "bash" && size > 0`
      (`src/engine/run-cycle.ts:143-153`, plus `shouldSkipForArtifact`).
- [x] `step.skipped` event shape matches: `{cycle_id, step, reason:
      "artifact_present", artifact_path}` — no `agent` field.
- [x] `runCycle` emits no `step.start`/`step.end` on skip
      (`continue` at line 152).
- [x] `parseLogTail` treats `step.skipped` as terminal-equivalent
      (`src/engine/log-tail.ts:54-57`).
- [x] `--no-skip-completed` parsed
      (`src/cli/parse-args.ts:62, 74`).
- [x] CLI flag overrides YAML
      (`src/cli.ts:90-91`: ternary collapses to `false` first).
- [x] YAML default `true` when field absent
      (`src/cli.ts:91`: `?? true`).
- [x] Both `runCycle` call sites pass `attempt` and
      `skipCompletedOnRetry` (`src/cli.ts:316-318` resume,
      `src/cli.ts:410-411` fresh-pop).
- [x] `engine.start` carries `skip_completed_on_retry`
      (`src/cli.ts:93`).
- [x] All existing tests still pass (424/424).
- [x] `npm run typecheck` clean.
- [x] `npm run test:coverage` passes gate.
- [x] No `npm run sync-defaults` invocation.
- [ ] **SPEC AC1 grep semantics**: the AC says the grep "returns the
      expected lines under the retry test fixture." The unit tests
      do produce those lines, but only because they bypass the CLI
      flow. The same grep against a real production `.cycle/log.jsonl`
      after a real retry will return zero matches because the gate
      can't fire. AC is technically met by the unit fixture; the
      spirit (real retries skip work) is not. See MUST-FIX Task 1.

## Adversarial Test Review

### Summary
Adequate at the unit-contract layer; weak at the integration layer.
The four `shouldSkipForArtifact` tests and the six `runCycle` matrix
tests cover the gate predicate exhaustively in isolation. The
log-tail tests cover the `completedSteps` accumulator including
cross-`cycle_id` filtering. The parse-args tests cover both flag
states. What's missing is any test that drives the gate from the CLI
pop loop — the only seam where the design defect surfaces.

### Findings
1. **Mock-by-omission**: tests invoke `runCycle` directly with a
   literal `cycleId: "0001"` and pre-seed
   `docs/cycle/0001-feature-skip-test/` under that same id. There's
   no test that re-pops the same `tbd.jsonl` row and verifies the
   second `runCycle` call sees the first's artifacts. The test
   surface is correct for the helper; it's silent on the integration
   contract that the source issue actually asks for. —
   `tests/engine/run-cycle.skip-completed.test.ts:144-152`
2. **Source-issue AC drift**: the source issue's AC explicitly calls
   for an "Integration test: full feature workflow on a retry pop
   completes without re-running spec/research/plan when artifacts
   exist on the cycle branch." SPEC.md downscoped this to the unit
   matrix ("No new integration test fixture for this cycle"). The
   downscope is what allowed the cycle_id-reuse bug to ship
   undetected. — `docs/cycle/issues/todo/refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics.md:34`
3. **Resume-entry test is a tautology against an impossible state**:
   the "skip gate self-suppresses on resume entry" test passes
   `cycleId: "0001"`, `attempt: 1`, `resume: {startStepIndex: 0}`,
   and pre-seeded artifacts. In production, a resume that lands at
   `startStepIndex: 0` with `attempt: 1` implies a same-cycleId
   crash before any step ran, which means there's nothing to skip
   anyway. The test exercises the gate's predicate but doesn't
   correspond to any real recovery scenario. —
   `tests/engine/run-cycle.skip-completed.test.ts:283-313`
4. **Assertion strength**: assertions use anchored regexes against
   `log.jsonl` text (good — exact event-shape matching). Mock
   `claude` exits 1 in the "agent NOT invoked when skipped" test
   (good — proves the agent didn't run, not just that a log line
   appears).
5. **Test independence**: each test owns its own `mkdtemp` repo and
   `mkdtemp` PATH dir; cleanup is `try/finally`. No shared state. Good.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **99.01% / 93.04% / 97.01%** (all gates pass)
- Per-file regressions vs base: none. `src/engine/run-cycle.ts` is at
  100% line / 96.81% branch despite new branches. `src/engine/triage.ts`
  per-file floor 99.45% ≥ 95%.
- New code without tests: none — the helper, the gate, the log-tail
  change, and the CLI flag parser all have direct unit coverage.
- Specific scenarios missing tests:
  - End-to-end retry: pop, attempt 0, fail, drainFailedRetry, pop
    again, observe `step.skipped` events. Today's tests skip this
    seam entirely. Adding it surfaces the Task 1 defect immediately.
  - The interaction between resume and `cycleId` mismatch (resume
    detects the prior `cycle_id` doesn't equal the pending row's,
    falls through to fresh pop). The resume path's
    `skipCompletedOnRetry` threading is correct but untested for
    the case where resume self-suppresses and then the fresh pop
    runs with a new `cycleId`.

## Doc-vs-Code Claim Verification

The diff touches `CLAUDE.md`, `README.md`, and `docs/ARCHITECTURE.md`
— all in-scope.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `step.skipped` event shape `{cycle_id, step, reason: "artifact_present", artifact_path}` | `CLAUDE.md:78`, `docs/ARCHITECTURE.md:725` | `src/engine/run-cycle.ts:146-151` | OK |
| Skip predicate: `attempt > 0`, agent not bash, strict `> 0` bytes | `CLAUDE.md:78` | `src/engine/run-cycle.ts:143` + `shouldSkipForArtifact` line 39 (`st.size > 0`) | OK |
| Gate self-suppresses on resume entry | `CLAUDE.md:78`, `docs/ARCHITECTURE.md:730` | `src/engine/run-cycle.ts:141, 143` (`!isResumeEntry`) | OK |
| Opt-out: `cycle run --no-skip-completed` CLI flag, wins over YAML | `CLAUDE.md:78`, `README.md:42`, `docs/ARCHITECTURE.md:722-723` | `src/cli/parse-args.ts:62, 74`; `src/cli.ts:90-91` | OK |
| YAML field `engine.skip_completed_on_retry`, default `true` | `CLAUDE.md:78`, `docs/ARCHITECTURE.md:722` | `src/engine/workflow.ts:24`; `src/cli.ts:91` (`?? true`) | OK |
| Resolved boolean logged on `engine.start` as `skip_completed_on_retry` | `CLAUDE.md:78`, `docs/ARCHITECTURE.md:728` | `src/cli.ts:93` | OK |
| `parseLogTail` treats `step.skipped` as terminal-equivalent to `step.end status:"ok"` | `CLAUDE.md:78`, `docs/ARCHITECTURE.md:728-729` | `src/engine/log-tail.ts:52-58` | OK |
| `SKIP_ELIGIBLE_STEPS` hard-coded disjoint from `RESET_ELIGIBLE_STEPS` | `CLAUDE.md:78`, `docs/ARCHITECTURE.md:732-733` | `src/engine/run-cycle.ts:23, 29` (`{build, fix}` vs `{spec, research, plan}`) | OK |
| "On retry, the engine skips pre-build steps whose artifact files already exist non-empty" | `README.md:42` | no backing — `src/cli.ts:402` allocates fresh `cycleId` per pop; `src/engine/queue.ts:167` deletes `r.cycle_id`; `artifactDir` (`src/engine/branch.ts:36, 44, 59`) is therefore empty on the retry pop and the gate at `src/engine/run-cycle.ts:143-153` cannot fire | **UNBACKED** |
| "on `tbd.jsonl` retry pops with `attempt > 0`, the engine skips each of `{spec, research, plan}` whose `<artifactDir>/<STEP>.md` already exists with `> 0` bytes" | `CLAUDE.md:78` | same as above — predicate matches, but the inspected path is always a fresh empty dir on a real retry pop | **UNBACKED** |
| "on the second and later attempts of the same `(issue_id, cycle_id)` pair, the engine skips `{spec, research, plan}` if the corresponding `<artifactDir>/<STEP>.md` is present" | `docs/ARCHITECTURE.md:721-722` | the predicate is true, but `(issue_id, cycle_id)` pair changes across attempts under `src/engine/queue.ts:167` + `src/cli.ts:402` — so "second and later attempts of the same pair" never occurs in production | **UNBACKED** |

The three unbacked claims share a single root cause: the CLI retry-pop
flow allocates a fresh `cycle_id` per attempt, so the artifact dir the
gate inspects is always empty. Fix per MUST-FIX Task 1 (preserve
`cycle_id` across `drainFailedRetry`, reuse in `src/cli.ts:402`)
restores backing for all three claims simultaneously.
```

Wrote MUST-FIX.md with one critical task (preserve cycle_id across drainFailedRetry + reuse on retry pop) plus two unbacked-doc-claim tasks. REVIEW.md content above for stdout capture.

**Verdict: NEEDS-FIX.** Tests green, coverage healthy, mechanics clean — but skip gate cannot fire under real `tbd.jsonl` retry-pop flow because `drainFailedRetry` (`src/engine/queue.ts:167`) deletes `cycle_id` and `src/cli.ts:402` allocates fresh, yielding empty `artifactDir`. Unit tests bypass this by passing literal `cycleId` to `runCycle`. Three doc claims (CLAUDE.md, README.md, ARCHITECTURE.md) describe the feature as if it engages on retry — UNBACKED by production paths.
