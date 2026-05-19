All quality gates passed. Outputting the build summary:

---

Implemented all five PLAN.md tasks for Cycle 0124. Created `src/engine/stale-dist.ts` (31 lines) exporting `emitStaleDistWarning(log, processStart, cwd, statFn?)` with injectable `statFn` for testability; created `tests/engine/stale-dist.test.ts` (65 lines) with five `it` blocks covering stale, fresh-equal, fresh-behind, ENOENT, and non-ENOENT error branches; added `"src/engine/stale-dist.ts": 95` to the `FLOORS` table in `scripts/coverage-gate.mjs`; wired `const processStart = Date.now()` as the first executable line in `src/cli.ts` (line 38, before any `await`) and added `await emitStaleDistWarning(log, processStart, cwd)` immediately before `engine.start` emission (line 94); added `## Stale-dist warning` section to `docs/ENGINE.md` (lines 126–146) documenting all five payload fields, operator action, and ENOENT/fresh suppression. Full test suite: `~/.nvm/versions/node/v22.22.2/bin/node --test --experimental-strip-types --test-reporter=spec` — **447/447 pass** (was 441 before this cycle, +5 new + 1 from prior suite growth). Coverage: `npm run test:coverage` equivalent — line 99.19%, branch 92.30%, function 96.28%; `stale-dist.ts` at 100%/100%/100%. Coverage gate: all five per-file floors pass. Typecheck: `tsc --noEmit` clean. No deviations from PLAN.md.

## Touched Files
- src/engine/stale-dist.ts
- tests/engine/stale-dist.test.ts
- scripts/coverage-gate.mjs
- src/cli.ts
- docs/ENGINE.md
