All gates pass. Line 98.69%, Branch 92.44%, Function 93.36% — all above baseline. Per-file: `run-cycle.ts` 100%, `commit-cycle.ts` 99.44%.

## Summary

Modified `src/engine/run-cycle.ts` (5 lines added): exported `parseSnapshotPaths` and replaced the unconditional `??` skip with a prefix-filtered include — `src/` and `scripts/` untracked paths now accumulate into `touched.json`.

Modified `src/engine/commit-cycle.ts` (1 line): removed `xy === "??"` from the scope-warning skip guard so untracked `src/`/`scripts/` files absent from `touched.json` now emit `commit.scope_warning`.

Created `tests/engine/run-cycle.parse-snapshot.test.ts` (36 lines): six pure-function unit tests for `parseSnapshotPaths` covering all `??` path variants.

Modified `tests/engine/run-cycle.touched-json.test.ts` (+37 lines): added integration test confirming `accumulateTouchedFiles` captures a `??`-status `src/` file not staged by the agent.

Modified `tests/engine/commit-cycle.test.ts` (+79 lines, 2 fixups): added three scope-warning tests for `??` paths; pre-committed a file in `src/`/`scripts/` in two tests so git shows individual file paths rather than directory-level `??` entries.

Modified `docs/ENGINE.md`: updated footprint description to state `??` paths under `src/`/`scripts/` are now included; removed the "Known limitation" paragraph about the `??` exclusion gap.

Test command: `npm test` — 710 tests, 0 failures. Coverage: `npm run test:coverage` — 98.69% lines, 92.44% branches, 93.39% functions; all per-file floors pass including `run-cycle.ts` (100%) and `commit-cycle.ts` (99.44%).

No deviations from PLAN.md. No deferred work.

## Touched Files
- src/engine/run-cycle.ts
- src/engine/commit-cycle.ts
- tests/engine/run-cycle.parse-snapshot.test.ts
- tests/engine/run-cycle.touched-json.test.ts
- tests/engine/commit-cycle.test.ts
- docs/ENGINE.md
