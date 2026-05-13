# Must-Fix Items: Cycle 0017

## Summary
2 minor issues found in review. Implementation is functionally correct and SPEC-compliant; these items improve log fidelity and close a SPEC test-coverage gap.

## Tasks

- [x] ### Task 1: Clear `lastHaltContext` on successful cycle so `engine.stop` does not leak stale halt metadata
  **Status:** ✅ Fixed
  **What was done:** Added `lastHaltContext = undefined;` at both success branches (`src/cli.ts` resume-success around line 285 and main-loop success around line 359). Additionally, gated the `engine.stop` spread on `halted &&` (`src/cli.ts:391`) so the keys never appear on `status: "ok"` runs — without that gate, a run that ends on a sub-threshold terminal failure (e.g. fail→success→fail) would still leak the metadata since the *last* event sets `lastHaltContext`. Both fixes together satisfy the spec invariant "successful run reports no halt metadata." Verified with the added assertions in `tests/cli/halt.test.ts` "fail → success resets counter": `assert.equal(stop.halted_at_issue, undefined)` and `assert.equal(stop.failing_step, undefined)` now pass. `multi-loop.test.ts:117` (which asserts `halted_at_issue` is present on `halted` runs) still passes — gating only suppresses the keys when not halted.
  **Priority:** Minor
  **Files:** `src/cli.ts`
  **Problem:** `lastHaltContext` is set on every terminal failure (resume path at `src/cli.ts:288`, main loop at `src/cli.ts:366`) but is never cleared on success. With `max_consecutive_failures: 2`, a sequence "cycle A terminal-fails (counter→1, lastHaltContext=A) → cycle B succeeds (counter→0, failedCycles cleared, lastHaltContext untouched)" leaves `lastHaltContext` populated. The final `engine.stop` emission at `src/cli.ts:383-391` then spreads `halted_at_issue` and `failing_step` into the event even though `status: "ok"`. Consumers parsing the log would see contradictory metadata: a successful run that also reports a halted-at issue.
  **Fix:**
    1. In `src/cli.ts` at the resume-success branch (around line 282-284), add `lastHaltContext = undefined;` after `failedCycles = [];`.
    2. In `src/cli.ts` at the main-loop success branch (around line 357-358), add the same `lastHaltContext = undefined;` line after `failedCycles = [];`.
  **Verify:** Add an assertion in `tests/cli/halt.test.ts` "fail → success resets counter" test that the final `engine.stop` event has neither `halted_at_issue` nor `failing_step` keys present (e.g. `assert.equal(stop.halted_at_issue, undefined)` and `assert.equal(stop.failing_step, undefined)`). Run `npm test` — all 216+ tests pass.

- [x] ### Task 2: Add integration test asserting resume-terminal contributes to the consecutive-failures counter alongside main-loop terminals
  **Status:** ✅ Fixed
  **What was done:** Added a new test "halt: resume-terminal + main-loop-terminal accumulate to threshold 2" in `tests/cli/resume.test.ts` (not `halt.test.ts` as the recommendation suggested — resume requires the `setupRepoWithOrigin` clone fixture for `git fetch origin main`, which only exists in `resume.test.ts`; duplicating that helper into `halt.test.ts` would be churn). Extended `writeWorkflows` to accept `maxCycleAttempts` so the test can request threshold 2 + max_cycle_attempts 1. Test seeds `alpha` (in_progress, attempt 0, cycle_id "0042") and `beta` (pending), pre-creates `cycle/feature/alpha-task`, calls `seedLogInFlight("0042", "alpha", "feature", "alpha task")`, then runs the engine and asserts exit 1, `engine.halted.failed_cycles.length === 2`, `failed_cycles[0] === "0042"` (resumed), `failed_cycles[1] !== "0042"` (freshly-allocated), `queue.drained` events both have `outcome: "terminal"`. Confirms resume-terminal increments the same `consecutive_failures` counter as a main-loop terminal.
  **Priority:** Minor
  **Files:** `tests/cli/halt.test.ts` (new test) or `tests/cli/resume.test.ts` (new test)
  **Problem:** SPEC §Requirements states "Resume of an in-flight cycle that exits terminal-failed counts toward the counter as if it had just failed" and PLAN Task 3 explicitly called for "a fixture with two pre-existing queue rows where the resumed one terminates and the next one also terminates, threshold 2 → halt observed." This explicit cumulative-counter assertion is absent. The current resume terminal test (`tests/cli/resume.test.ts:360`) uses `max_consecutive_failures: 1`, which proves resume-terminal can halt on its own but does not prove it composes with main-loop terminal failures into one shared counter.
  **Fix:**
    1. Add a new test (recommended: in `tests/cli/halt.test.ts`) named "halt: resume-terminal + main-loop-terminal accumulate to threshold 2".
    2. Set up: `bootstrapRepo` with `workflowYml(2, 1)` (threshold 2, attempts 1). Seed two rows: `alpha` (in_progress, attempt 0, cycle_id "0042") and `beta` (pending). Use `verifyScript(["alpha", "beta"])` so both fail. Pre-create `cycle/feature/alpha-task` branch. Use `seedLogInFlight(workRoot, "0042", "alpha", "feature", "alpha task")` so engine resumes alpha first.
    3. Assert: `r.status === 1`, `engine.halted` event present with `failed_cycles.length === 2`, `threshold: 2`. The first failed cycle id should be `"0042"` (resumed) and the second should be the freshly-allocated cycle id from main-loop popping beta.
  **Verify:** Run `node --test tests/cli/halt.test.ts` — new test passes. Run `npm test` — full suite passes. Run `npm run test:coverage` — `src/cli.ts` lines around 285-292 (resume-terminal counter increment) and 364-371 (main-loop terminal counter increment) both retain coverage.
