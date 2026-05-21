10/10 pass. All quality gates satisfied.

Modified `tests/cli/engine-lock-integration.test.ts` (246 → 257 lines): added `stat` to the `node:fs/promises` import, defined `waitForAbsence(filePath, {timeout=2000, interval=50})` after `waitForLock` — same poll-loop shape, inverts the success condition via `stat`+`ENOENT`, propagates non-ENOENT errors immediately — and replaced the 7-line bare `readFile`/`lockExists` block at lines 235–241 of the SIGTERM test with a single `await waitForAbsence(lockPath)`. All PLAN.md tasks are complete (single task, three sub-changes). Test suite: `npm test` → 713/713 pass, zero failures. Coverage: `npm run test:coverage` → line 98.69%, branch 92.38%, function 93.36%; `engine-lock.ts` 100% line coverage maintained; all per-file floors and `check:invariants` pass. The isolated test passed all 10 consecutive runs confirming determinism. No deviations from PLAN.md. Pre-existing `tsc --noEmit` error in `src/cli.ts:241` (TS2345 on `CYCLE_TRUNK_BASED` type) is not introduced by this cycle. No follow-up work required.

## Touched Files
- tests/cli/engine-lock-integration.test.ts
