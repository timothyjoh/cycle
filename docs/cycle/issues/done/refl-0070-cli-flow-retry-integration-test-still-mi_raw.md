---
id: refl-0070-cli-flow-retry-integration-test-still-mi
source: reflection
title: cli-flow-retry-integration-test-still-missing-after-task-1-fix
added_at: "2026-05-15T20:46:56.718Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0070"
---

Task 1 of MUST-FIX added an integration test in `tests/engine/run-cycle.skip-completed.test.ts` that calls `runCycle` twice with the same literal `cycleId`. That covers the helper round-trip but still does NOT drive the actual CLI seam where the original defect lived: `popNextPending` → terminal failure → `drainFailedRetry` → `popNextPending` → `runCycle`. The bug shipped specifically because `delete r.cycle_id` in `drainFailedRetry` plus a fresh `allocateCycleId` in `src/cli.ts:402` together produced a stale `artifactDir`; both call sites are still untouched by any test fixture that exercises them in sequence.

If a future cleanup re-introduces `delete r.cycle_id` (it looks dead — nobody reads `cycle_id` off the row, the engine allocates fresh anyway, so a static-analysis pass or a YAGNI refactor could plausibly remove the carry-over invariant), the unit tests will all stay green and the bug will silently regress.

Suggested direction: add a single test that pushes a `tbd.jsonl` row, calls `popNextPending`, runs a `runCycle` that fails terminally, calls `drainFailedRetry`, calls `popNextPending` again, asserts the second pop's `cycle_id` matches the first, and asserts the second `runCycle` emits `step.skipped` for spec/research/plan. This is the integration test the source issue originally called for and that SPEC.md downscoped away.
