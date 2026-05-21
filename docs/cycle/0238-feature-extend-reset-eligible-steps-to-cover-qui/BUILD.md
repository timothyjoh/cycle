All gates pass. `src/engine/run-cycle.ts` is at 100% line coverage. Overall: line 98.69%, branch 92.43%, function 93.36% — all above the floors.

Modified `src/engine/run-cycle.ts` (1 line: export + extend `RESET_ELIGIBLE_STEPS`), `tests/engine/run-cycle.test.ts` (+67 lines: `workflowYmlQuickfix` helper, membership unit test, `quick_fix` footprint accumulation integration test, updated import), `tests/engine/commit-cycle.test.ts` (+40 lines: `quick_fix` in-footprint scope-warning suppression test), `docs/ENGINE.md` (updated step-name prose in lines 153, 155, 157; removed known-limitation paragraph for quickfix/e2e-tests exclusion). All 5 PLAN.md tasks complete. `npm test` passed 699/699. `npm run test:coverage` passed all per-file floors; `src/engine/run-cycle.ts` at 100% line coverage. No deviations from PLAN.md. No deferred work.

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/run-cycle.test.ts
- tests/engine/commit-cycle.test.ts
- docs/ENGINE.md
