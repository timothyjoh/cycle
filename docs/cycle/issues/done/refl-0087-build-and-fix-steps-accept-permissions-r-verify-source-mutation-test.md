---
id: refl-0087-build-and-fix-steps-accept-permissions-r-verify-source-mutation-test
title: Regression tests pinning verify step source-mutation guard
workflow: feature
depends_on: [refl-0087-build-and-fix-steps-accept-permissions-r-verify-source-mutation-guard]
triaged_at: "2026-05-16T03:06:11.012Z"
source: triage
parent: refl-0087-build-and-fix-steps-accept-permissions-r
---
## Problem

The verify source-mutation guard (implemented in `refl-0087-build-and-fix-steps-accept-permissions-r-verify-source-mutation-guard`) needs regression tests so future edits to `scripts/verify.sh` cannot silently remove the guard without a test failure.

## Fix

Add tests to `tests/defaults/verify.test.ts` (or create it following the pattern of `tests/defaults/commit*.test.ts`) covering at minimum:

1. **Only `docs/cycle/` changes**: repo where only `docs/cycle/SOMETHING.md` is added/modified → verify exits non-zero.
2. **Mixed changes**: repo where both `docs/cycle/` and `src/` files are modified → verify exits 0.
3. **No changes at all**: repo with no commits beyond base → verify exits non-zero.
4. **Only `src/` changes**: repo where only `src/engine/foo.ts` is modified → verify exits 0.

Each test should: create a temp git repo, set `CYCLE_BASE` to point at the base commit, invoke `scripts/verify.sh` via `spawnSync`, and assert the exit code.

## Acceptance Criteria

1. All four cases above are covered with explicit exit-code assertions.
2. Tests run under `npm test` and pass on master.
3. Coverage for the verify guard logic does not decrease the line/branch/function baseline.
4. Test file follows the shared helper patterns established in `tests/defaults/` (reuse `makeRepo`/`runScript`/`commitFiles` if extracted by `refl-0068-shared-helpers-for-tests-defaults-commit`).
