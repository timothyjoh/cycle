699 pass, 0 fail. `commit-cycle.ts` at 99.49% (floor 95%), `run-cycle.ts` at 100.00% (floor 90%). All coverage gates green.

## Summary

Implementation was fully complete from a prior session in this branch. Verified all five PLAN.md tasks are in place: `readdir` removed from `src/engine/commit-cycle.ts` and replaced with `if (opts.artifactDir)` guard; `artifactDir?: string` added to inline opts type; `src/engine/run-cycle.ts` both return shapes include `artifactDir`; `src/cli.ts` imports `slugify` and computes `artifactDir` deterministically at both `commitCycle` call sites; `tests/engine/commit-cycle.test.ts` has the updated in-footprint test and new regression test; `docs/ENGINE.md` known-limitation note removed. Test suite: `npm test` — 699 pass, 0 fail. Coverage: `src/engine/commit-cycle.ts` 99.49% line (floor 95%), `src/engine/run-cycle.ts` 100.00% line (floor 90%), all per-file floors met, no regressions. `npm run typecheck` — zero errors. No deviations from PLAN.md.

## Touched Files
- src/engine/commit-cycle.ts
- src/engine/run-cycle.ts
- src/cli.ts
- tests/engine/commit-cycle.test.ts
- docs/ENGINE.md
