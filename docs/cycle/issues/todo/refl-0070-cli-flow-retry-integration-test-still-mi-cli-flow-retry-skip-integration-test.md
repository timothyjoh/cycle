---
id: refl-0070-cli-flow-retry-integration-test-still-mi-cli-flow-retry-skip-integration-test
title: Add CLI-flow integration test pinning popNextPending → drainFailedRetry → popNextPending cycle_id round-trip with skip-completed assertions
workflow: feature
depends_on: []
triaged_at: "2026-05-15T20:52:05.720Z"
source: triage
parent: refl-0070-cli-flow-retry-integration-test-still-mi
---
## Context

Cycle 0070 shipped the retry-economics skip-completed-on-retry feature. A post-cycle MUST-FIX pass (cycle 0070 Task 1) discovered the unit-test coverage was missing the exact seam where the original defect lived: `popNextPending` → terminal failure → `drainFailedRetry` → `popNextPending` → `runCycle`. The fix removed `delete r.cycle_id` from `drainFailedRetry` (`src/engine/queue.ts:161-172`) and changed `src/cli.ts:402` from a fresh `allocateCycleId` to `row.cycle_id ?? (await allocateCycleId(cwd))` so retry pops reuse the prior attempt's cycleId. That fix was covered by a unit test in `tests/engine/run-cycle.skip-completed.test.ts` that manually invokes `runCycle` twice with the same literal `cycleId` — exercising the helper round-trip but **not** the queue/CLI seam.

## Problem

The original defect ships because `delete r.cycle_id` + fresh `allocateCycleId` together produce a stale `artifactDir` on retry. Both call sites are still untouched by any test fixture that exercises them in sequence. If a future cleanup re-introduces `delete r.cycle_id` (it looks dead — nobody reads `cycle_id` off the row, the engine appears to allocate fresh anyway, so a static-analysis pass or a YAGNI refactor could plausibly remove the carry-over invariant), the unit tests stay green and the bug silently regresses.

SPEC.md downscoped this exact integration test away during cycle 0070. The source issue originally called for it.

## Acceptance criteria

1. New test file (or new test block in an existing CLI-flow suite — likely `tests/engine/queue.test.ts` or a new `tests/cli/retry-skip-flow.test.ts`) that does, in one test:
   - Write a `tbd.jsonl` row with a known id.
   - Call `popNextPending` and capture the assigned `cycle_id` (call it `first`).
   - Drive a `runCycle` (or simulate via the same code path the CLI uses) that fails terminally on a pre-build step, leaving artifacts on disk under `docs/cycle/<first>-<workflow>-<slug>/`.
   - Call `drainFailedRetry` on the row.
   - Call `popNextPending` again and capture the assigned `cycle_id` (call it `second`).
   - Assert `second === first` (cycle_id preserved across the retry pop).
   - Drive the second `runCycle` and assert it emits `step.skipped {reason:"artifact_present"}` for each of `spec`/`research`/`plan` (three events).
2. Test must fail if either (a) `delete r.cycle_id` is reintroduced in `drainFailedRetry`, or (b) `src/cli.ts:402` is changed back to unconditional `allocateCycleId`. (Verify by temporarily reverting either change locally and confirming red.)
3. Test uses the same fake-claude stub pattern as `tests/engine/run-cycle.skip-completed.test.ts` for the agent steps; no real `claude` binary required.
4. `npm test` passes with the new test green.
5. Coverage non-regression: line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file gate `src/engine/triage.ts ≥ 95%` still passes.

## Notes

- The CLI-flow seam is at `src/cli.ts` around the pop → runCycle → drain loop. Look at how `runCliOnce` or the engine loop orchestrates the calls — the test should drive whatever helper sits closest to the real CLI flow (avoid duplicating the entire `cli.ts` body in a fixture).
- Existing helper test at `tests/engine/run-cycle.skip-completed.test.ts` is the closest reference for the second-runCycle assertion shape; the new test extends it backward to cover the queue mutation seam.
- Acceptance: this is the regression test the cycle-0070 source issue originally called for and that SPEC.md downscoped away.
