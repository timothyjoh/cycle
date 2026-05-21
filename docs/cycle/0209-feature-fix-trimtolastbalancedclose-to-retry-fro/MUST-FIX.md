# Must-Fix Items: Cycle 0209

## Summary
1 minor issue found in review.

## Tasks

- [x] ### Task 1: Update stale test name at line 265
  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts`
  **Problem:** Test at line 265 is titled "repair-substring still invalid JSON escalates with **second**-parse error message". The old implementation returned `e2.message` (from the second `JSON.parse` call). The new retry loop exhausts all brace candidates and returns `e1.message` (the original full-string parse error). The name now misdescribes the behavior — a future reader would incorrectly conclude the test is verifying a second-pass error, not the first.
  **Fix:** Rename the test to drop the "second-parse" qualifier. Suggested name:
  ```
  "ingestReflection: repair-substring still invalid JSON exhausts retry loop and escalates"
  ```
  No change to the assertion body needed.
  **Verify:** `grep -n "second-parse" tests/engine/reflection.test.ts` returns no matches; `npm test` passes (594 tests, 0 failures).
  **Status:** ✅ Fixed
  **What was done:** Renamed test at line 265 from "…escalates with second-parse error message" to "…exhausts retry loop and escalates". Verified no remaining "second-parse" references. Full test suite: 594 tests, 594 pass, 0 fail. Coverage: Line 98.51%, Branch 92.50%, Function 92.95% — all gates pass, no regression.
