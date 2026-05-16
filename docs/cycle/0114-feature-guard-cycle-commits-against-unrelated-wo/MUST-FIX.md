# Must-Fix Items: Cycle 0114

## Summary
3 issues: 2 critical (unbacked doc claims), 1 minor (uncovered branch).

## Tasks

- [x] ### Task 1 (Unbacked Doc Claim): Fix trunk artifact dir description
  **Status:** ✅ Fixed
  **What was done:** Edited `docs/ENGINE.md` line 101. Changed "keyed by `cycle/<workflow>/<slug>`" to "at `docs/cycle/<cycleId>-<workflow>-<slug>`" to match actual path format in `src/engine/branch.ts:59`.

- [x] ### Task 2 (Unbacked Doc Claim): Fix or enforce worktree-pr "No automatic push" claim
  **Status:** ✅ Fixed
  **What was done:** Applied Option A (correct the doc). Edited `docs/ENGINE.md` line 105. Replaced "No automatic push;" with "Push behavior follows `config.push` (same as `trunk`);" to accurately reflect the code in `src/engine/commit-cycle.ts` where no push suppression exists for `worktree-pr` mode.

- [x] ### Task 3: Add scopeGuard rename/copy path test
  **Status:** ✅ Fixed
  **What was done:** Added test "scopeGuard — renamed file outside touched list returned as blocked (destination path)" in `tests/engine/commit-cycle.test.ts`. Fake git status returns `R  old.ts -> README-renamed.md`; test asserts `["README-renamed.md"]` is returned as blocked. `commit-cycle.ts` branch coverage increased from 85.29% to 85.88%; lines 72–74 now covered.
