Clean. All tasks complete.

Created and modified files: `src/engine/commit-cycle.ts` (+54 lines: `parseTouchedFiles`, `scopeGuard`, extended `CommitResult` union, `readdir` import, `scopeGuard` wire-up in `commitCycle()`); `tests/engine/commit-cycle.test.ts` (+185 lines: 10 new tests covering `parseTouchedFiles` unit cases, `scopeGuard` unit cases, `commitCycle` scope_violation integration, clean-scope integration, and regression test with real git repo); `src/defaults/prompts/build.md` (+7 lines: `## Touched Files` YAML list requirement); `.cycle/prompts/build.md` (synced via `npm run sync-defaults`); `scripts/coverage-gate.mjs` (+1 line: `commit-cycle.ts` floor at 95%); `docs/ENGINE.md` (+12 lines: scope guard subsection). All 5 PLAN.md tasks complete. Test suite: 428/428 passing (`npm test`). Coverage: line 99.05%, branch 91.91%, function 97.22% (all above baseline); `commit-cycle.ts` per-file: 98.12% ≥ 95% floor. No deviations from PLAN.md. No deferred work.

## Touched Files
- src/engine/commit-cycle.ts
- tests/engine/commit-cycle.test.ts
- src/defaults/prompts/build.md
- .cycle/prompts/build.md
- scripts/coverage-gate.mjs
- docs/ENGINE.md
