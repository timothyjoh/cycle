# Must-Fix Items: Cycle 0208

## Summary
0 critical issues, 2 minor issues found in review.

## Tasks

- [x] ### Task 1: Add direct unit test for unanchored `stripFences` behavior
  **Priority:** Minor
  **Files:** `tests/engine/log-fmt.test.ts`
  **Problem:** `log-fmt.ts` was modified to remove `^`/`$` anchors from the `stripFences`
    regex (the key change enabling this cycle's fix), but no test in `log-fmt.test.ts`
    directly exercises the new embedded-fence behavior. The 9 existing tests only cover
    whole-string fences (no leading prose). A reader of `log-fmt.test.ts` cannot tell
    that `stripFences` handles prose-before-fence input.
  **Fix:** Add one test to `tests/engine/log-fmt.test.ts` (after line 48):
    ```ts
    test("stripFences: strips fence embedded after leading prose", () => {
      const inner = '{"key":"val"}';
      assert.equal(
        stripFences("Error in step {build}:\n```json\n" + inner + "\n```"),
        inner
      );
    });
    ```
  **Verify:** `npm test` passes; `npm run test:coverage` shows `log-fmt.ts` still at
    100% line/branch/function.
  **Status:** ✅ Fixed
  **What was done:** Added the test exactly as specified after line 48 in `tests/engine/log-fmt.test.ts`. `log-fmt.ts` remains at 100% line/branch/function coverage.

- [x] ### Task 2: Fix misleading test name and comment for repair-path test
  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts`
  **Problem:** Test at line 146 is named `"ingestReflection: leading prose + fenced JSON
    + trailing prose recovers via repair pass"` and has a comment at line 157:
    `"repair pass succeeds — no reflection.skipped"`. After this cycle adds
    `s = stripFences(s)` as the first statement in `parseWithRepair`, this input
    (`"Here is the output:\n```json\n{...}\n```\nHope that helps!"`) is now handled by
    `stripFences` before the repair path is ever invoked. The test name and comment
    describe the wrong mechanism.
  **Fix:** Rename the test and update the comment to reflect the actual mechanism:
    - Line 146: rename to
      `"ingestReflection: leading prose + fenced JSON + trailing prose parsed via stripFences"`
    - Line 157: change comment string from
      `"repair pass succeeds — no reflection.skipped"` to
      `"stripFences extracts fence before repair path — no reflection.skipped"`
  **Verify:** `npm test` passes; the updated test name accurately describes that
    `stripFences` (not the repair pass) handles the fenced-with-surrounding-prose case.
  **Status:** ✅ Fixed
  **What was done:** Renamed test at line 146 and updated assert message at line 157 exactly as specified.
