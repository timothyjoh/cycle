All gates pass. `path-utils.ts` at 100.00% ≥ 100%. Global: line 98.43%, branch 92.29%, function 93.24% — all above floor.

`★ Insight ─────────────────────────────────────`
The coverage-gate test fixtures are a second registry that mirrors the FLOORS table — every time you add a floor entry, you must also add the file to 3 fixture blocks in the test. This coupling is load-bearing: the test validates the gate script's normalization logic against a known-good LCOV, not just the gate's exit code.
`─────────────────────────────────────────────────`

Created `src/engine/path-utils.ts` (12 lines) exporting the unified `isDenied` helper; updated `src/engine/commit-cycle.ts` to remove its local `isDenied`/`DENYLIST_*` definitions and import from `path-utils.ts`; updated `src/engine/run-cycle.ts` to remove its local `isDocAppendDenied`/`DOC_APPEND_DENYLIST_*` definitions, import `isDenied` from `path-utils.ts`, and rename the one call site; created `tests/engine/path-utils.test.ts` (39 lines) covering all three branches; added `"src/engine/path-utils.ts": 100` to `scripts/coverage-gate.mjs` FLOORS; updated the three fixture blocks in `tests/scripts/coverage-gate.test.ts` to include `path-utils.ts`. All 5 PLAN.md tasks complete. `npm test` ran 565 tests, 0 failures. `npm run test:coverage` shows line 98.43% / branch 92.29% / function 93.24%; `path-utils.ts` at 100.00% ≥ 100% floor; all per-file gates pass. No deviations from PLAN.md. No deferred work.

## Touched Files
- src/engine/path-utils.ts
- src/engine/commit-cycle.ts
- src/engine/run-cycle.ts
- tests/engine/path-utils.test.ts
- scripts/coverage-gate.mjs
- tests/scripts/coverage-gate.test.ts
- CLAUDE.md
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0198-appenddocumentationpaths-porcelain-parsi.md
- docs/cycle/issues/raw/refl-0198-prepaths-rename-copy-branch-in-pre-snaps.md
- docs/cycle/issues/raw/refl-0198-untracked-to-staged-transition-bypasses.md
- docs/cycle/issues/todo/refl-0188-appenddocumentationpaths-reads-full-work.md
