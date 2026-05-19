File is complete and correct. All quality gates are met. Producing the required build output:

---

Created `tests/scripts/coverage-gate.test.ts` (130 lines). Task 1 (the only task) is complete: all 5 SPEC acceptance-criteria test cases are written and passing — passing path (exit 0), failing path (exit 1), missing block (exit 2), absent LCOV file (exit 2), and absolute SF: normalization (exit 0). One deviation from PLAN.md: test 5 required `realpath(root)` to resolve the macOS `/tmp` → `/private/tmp` symlink; without it, `relative(process.cwd(), sf)` in the child process produced a wrong path because `process.cwd()` returns the real path. Added `realpath` to the `node:fs/promises` import accordingly; PLAN.md did not anticipate this macOS-specific behavior. Test suite run: `node --test --experimental-strip-types --test-reporter=spec` (node v22.22.2) — 474 tests, 0 failures, 0 skipped (469 pre-existing + 5 new). Coverage run: `node --experimental-strip-types --experimental-test-coverage --test-reporter=spec` — `tests/scripts/coverage-gate.test.ts` 100% line | 100% branch | 100% function; all 6 per-file floor gates pass (`scripts/coverage-gate.mjs` verified via direct invocation: triage.ts 99.46% ≥ 95%, issue-lifecycle.ts 100% ≥ 95%, commit-cycle.ts 99.53% ≥ 95%, branch.ts 99.22% ≥ 90%, stale-dist.ts 100% ≥ 95%, run-one.ts 73.96% ≥ 70%). No CLAUDE.md or README.md changes required per SPEC. TypeScript typecheck (`tsc --noEmit`) passed with zero warnings.

## Touched Files
- tests/scripts/coverage-gate.test.ts
