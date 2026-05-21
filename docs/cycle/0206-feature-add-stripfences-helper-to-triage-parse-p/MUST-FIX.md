# Must-Fix Items: Cycle 0206

## Summary
1 minor issue: missing per-file coverage floor for `src/engine/log-fmt.ts`.

## Tasks

- [x] ### Task 1: Register per-file coverage floor for `src/engine/log-fmt.ts`
  **Status:** ✅ Fixed
  **What was done:** Added `"src/engine/log-fmt.ts": 100` to `FLOORS` in `scripts/coverage-gate.mjs`; appended `` `src/engine/log-fmt.ts` (100%) `` to the per-file floors list in `CLAUDE.md` Coverage policy section; updated the Architecture section description to mention both `truncateHeadCapped` and `stripFences` exports; added `log-fmt.ts` to all three coverage-gate test fixtures (`ALL_PASSING`, "below floor" inline fixture, and "absolute SF" fixture). `npm run check:coverage` confirms `coverage-gate: ok — src/engine/log-fmt.ts 100.00% ≥ 100%`. Full suite: 586 tests, 0 failures.
  **Priority:** Minor
  **Files:** `scripts/coverage-gate.mjs`, `CLAUDE.md`
  **Problem:** `src/engine/log-fmt.ts` now exports `stripFences`, a function on the critical triage parse path. No per-file coverage floor is registered in `scripts/coverage-gate.mjs` (the `FLOORS` table at line 12) or documented in `CLAUDE.md`. If a future edit drops coverage on this file, no gate will catch it. Established project convention (per cycles 0202 and 0204): every shared engine utility with a critical-path function gets a floor. `log-fmt.ts` is currently at 100% coverage but unprotected.
  **Fix:**
  1. In `scripts/coverage-gate.mjs`, add `"src/engine/log-fmt.ts": 100` to the `FLOORS` object (e.g., after `"src/engine/child-env.ts": 100` at line 25).
  2. In `CLAUDE.md`, append `` `src/engine/log-fmt.ts` (100%) `` to the per-file floors list in the Coverage policy section (the list ending with `src/engine/child-env.ts` (100%)). Update the description of `src/engine/log-fmt.ts` in the Architecture section to mention both exports: `truncateHeadCapped(s, max)` and `stripFences(s)`.
  **Verify:** `npm run check:coverage` prints `coverage-gate: ok — src/engine/log-fmt.ts 100.00% ≥ 100`; `grep "log-fmt" CLAUDE.md` shows the updated floor entry.
