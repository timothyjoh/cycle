All gates pass. `dot-env.ts` branch coverage: **100.00%** (was 92.31%).

Aggregate: Line 98.69%, Branch 92.47%, Function 93.44% — all up or flat vs baseline.

## Summary

Modified `src/engine/dot-env.ts` (lines 7–11 → 7–14, +3 lines): replaced bare `throw e` with a wrapped `Error` carrying an actionable prefix message (`Cannot read .env file at <path>: <original message>`) and the original `.code` property intact.

Modified `tests/engine/dot-env.test.ts` (+42 lines): extended `node:test` import to include `mock`; extended `node:fs` sync import to include `chmodSync` and `rmSync`; added `import * as nodefs` for `mock.method` targeting; appended new test "non-ENOENT error (EACCES) is re-thrown with actionable message" using the chmod-primary/mock-root-guard dual approach with full `instanceof Error`, `.code`, and `.message` assertions.

Modified `docs/ENGINE.md` (line 226, 1 line changed): replaced "Known limitation" paragraph with updated text reflecting the wrapped-error behavior, removing the "test suite does not exercise this path" sentence.

`npm test`: all tests pass (8 dot-env tests, full suite green). `npm run test:coverage`: Line 98.69%, Branch 92.47%, Function 93.44% — no regression. `npm run check:coverage`: all per-file floors pass, including `src/engine/dot-env.ts 100.00% ≥ 100%`. Both tasks from PLAN.md complete. No deviations from PLAN.md.

## Touched Files
- src/engine/dot-env.ts
- tests/engine/dot-env.test.ts
- docs/ENGINE.md
