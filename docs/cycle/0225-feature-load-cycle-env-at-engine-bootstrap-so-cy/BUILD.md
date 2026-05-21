All gates pass. `src/engine/dot-env.ts 100.00% ≥ 100%`. Final numbers: Line 98.54%, Branch 92.52%, Function 92.98% — all above baseline.

---

Created `src/engine/dot-env.ts` (21 lines) with synchronous ENOENT-safe `.env` parser using real-env-wins semantics. Created `tests/engine/dot-env.test.ts` (100 lines) covering all 7 SPEC cases including integration smoke through `loadConfig`. Added `src/engine/dot-env.ts: 100` to `scripts/coverage-gate.mjs` FLOORS table and updated the three fixture lists in `tests/scripts/coverage-gate.test.ts`. Wired `loadDotEnv(join(cwd, ".cycle", ".env"))` into `src/cli.ts` at line 138 between `--trunk` check and `loadConfig`. Added bootstrap precedence note to `docs/ENGINE.md`. Ran `npm test`: 666/666 pass. Ran `npm run test:coverage`: Line 98.54%, Branch 92.52%, Function 92.98%; `dot-env.ts` at 100% line coverage; all per-file floors hold.

## Touched Files
- src/engine/dot-env.ts
- tests/engine/dot-env.test.ts
- scripts/coverage-gate.mjs
- tests/scripts/coverage-gate.test.ts
- src/cli.ts
- docs/ENGINE.md
- CLAUDE.md
