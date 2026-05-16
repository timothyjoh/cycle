# FINDINGS — Cycle 0110

## Acceptance Criteria Results

| AC | Check | Result | Evidence |
|---|---|---|---|
| 1 | `refl-0078` in `done/` | PASS | `docs/cycle/issues/done/refl-0078-build-and-fix-steps-silently-succeed-whe.md` exists |
| 2 | `refl-0079` in `done/` | PASS | `docs/cycle/issues/done/refl-0079-cycle-0079-tsconfig-floor-guard-never-bu.md` exists |
| 3a | `check-tsconfig-floor.mjs` exists | PASS | File present at `scripts/check-tsconfig-floor.mjs` (67 lines) |
| 3b | Content is a tsconfig validator | FAIL | File is byte-for-byte identical to `scripts/coverage-gate.mjs` (per-file LCOV checker); `diff scripts/check-tsconfig-floor.mjs scripts/coverage-gate.mjs` exits 0 with no output |
| 3c | Referenced in `package.json` | FAIL | Key `check:tsconfig-floor` absent from `package.json` scripts block; `grep "check-tsconfig-floor" package.json` exits 1 |
| 4a | CLAUDE.md documents ES2023 floor | PASS | `CLAUDE.md:14` — `TypeScript floor is **ES2023**` |
| 4b | CLAUDE.md documents guard command | FAIL | `check:tsconfig-floor` / `check-tsconfig-floor` absent from CLAUDE.md |
| 5 | `npm test` passes | PASS | 438 pass / 0 fail (Node 22.22.2) |
| 6 | `FINDINGS.md` emitted | PASS | This file |
| 7 | All existing tests still pass | PASS | 438/438 — identical to cycle 0109 baseline; no regressions |
| 8 | No compiler/linter warnings introduced | PASS | Zero source changes in this cycle; no warnings introduced. Pre-existing: `tests/dogfood/feature-yaml.test.ts` has 5 implicit-`any` TS7006 errors on YAML-parsed arrow function params — present before this cycle, not introduced by it |

## Additional Findings (Non-AC Gaps)

- **Empty-diff guard absent from source**: `src/engine/run-cycle.ts` contains no `EMPTY_DIFF_GUARD_STEPS` constant, no `formatBuildGuardError` helper, and no `git diff HEAD` invocation. The `refl-0078` issue file is in `done/` (AC 1 passes) but the implementation it describes is not in source. Memory observation 1141 records: "Empty-diff post-condition guard implementation lost in cycle 0080." The cycle 0079 silent-success failure mode is partially unmitigated.
- **RFC-002 unannotated**: `docs/RFC-002-typescript-es2023-floor.md` line 19 still reads "A CI check that pins the lib floor is a separate, deferrable concern" — not annotated as resolved despite `refl-0079`'s issue file listing RFC-002 annotation as an implementation task.
- **Test file absent**: `tests/scripts/check-tsconfig-floor.test.ts` does not exist; referenced as an AC in `refl-0079`'s issue file.
- **Pre-existing typecheck failures**: `tsc --noEmit` exits 2 on `tests/dogfood/feature-yaml.test.ts` (5 TS7006 errors). Not introduced by this cycle; not counted against AC 8.

## Closure Statement

**Cycle 0110 FAILS.** Three AC sub-checks fail (3b, 3c, 4b). The tsconfig floor guard (`refl-0079`) is not implemented: `scripts/check-tsconfig-floor.mjs` contains wrong content (a byte-for-byte duplicate of `coverage-gate.mjs`, implementing per-file LCOV checking, not tsconfig validation) and is not wired into `package.json` or documented in CLAUDE.md. Additionally, the empty-diff guard (`refl-0078`) is absent from `src/engine/run-cycle.ts` source despite the issue being marked done. The cycle 0079 silent-success failure mode is NOT closed. Follow-on fix cycles are required for both guards.
