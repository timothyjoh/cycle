482/482 pass, 0 fail. All gates green.

Cycle 0140 implementation complete. Created `scripts/structural-invariants.mjs` (47 lines) with two INVARIANTS entries for `triage.ts` `childIds`; wired `check:invariants` npm script and extended `posttest:coverage` to fan out to both gates; added 90% coverage floor in `coverage-gate.mjs`; created `tests/fixtures/structural-invariants/triage-clean.ts` and `triage-violation.ts` fixture files; wrote `tests/scripts/structural-invariants.test.ts` (53 lines, 3 tests); excluded `tests/fixtures/**` from `tsconfig.json`; updated `CLAUDE.md` with `## Structural-invariants policy` section and `check:invariants` in Commands table; updated `tests/scripts/coverage-gate.test.ts` to add 8th LCOV floor entry. All 482 tests pass (up from 479). Coverage: Line 98.40%, Branch 91.66%, Function 95.43% — all above baseline. Per-file gates: all 8 floors pass including `scripts/structural-invariants.mjs` at 93.62% ≥ 90%. Typecheck: clean. No deviations from PLAN.md. No deferred work.

## Touched Files
- scripts/structural-invariants.mjs
- package.json
- scripts/coverage-gate.mjs
- tests/fixtures/structural-invariants/triage-clean.ts
- tests/fixtures/structural-invariants/triage-violation.ts
- tests/scripts/structural-invariants.test.ts
- tests/scripts/coverage-gate.test.ts
- tsconfig.json
- CLAUDE.md
