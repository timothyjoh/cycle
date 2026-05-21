# Must-Fix Items: Cycle 0234

## Summary
1 critical issue (unbacked doc claim), 1 minor issue (missing AC assertion).

## Tasks

- [x] ### Task 1 (Unbacked Doc Claim): ENGINE.md line 46 priority sort chain still lists `discuss`
  **Priority:** Critical
  **Doc:** `docs/ENGINE.md:46`
  **Claim prose:** "`popNextPending` sorts pending rows by priority tier before selecting the next row: `critical → high → medium → low → discuss`"
  **Expected backing:** `src/engine/queue.ts:166-168` — but code filters `discuss` rows out *before* sorting: `.filter((r) => r.status === "pending" && r.priority !== "discuss")`. `discuss` never enters the sort. The claim that `popNextPending` sorts and processes `discuss` rows (last) is false post-cycle-0234.
  **Fix:** Edit `docs/ENGINE.md:46`. Change `critical → high → medium → low → discuss` to `critical → high → medium → low`. Add a parenthetical: `(discuss rows are filtered out before selection — see note below)`. Result:

  ```
  **Priority sort**: `popNextPending` sorts pending rows by priority tier before selecting the next row: `critical → high → medium → low` (discuss rows are filtered out before selection — see note below). Sort is stable — rows within the same tier drain in `triaged_at` insertion order. ...
  ```

  **Verify:** `grep -n "discuss" docs/ENGINE.md | grep "46:"` should no longer show `discuss` in the sort chain. Cross-check `src/engine/queue.ts:166-168` — filter excludes `discuss` before sort, consistent with updated doc.
  **Status:** ✅ Fixed
  **What was done:** Changed `critical → high → medium → low → discuss` to `critical → high → medium → low` and added `(discuss rows are filtered out before selection — see note below)` parenthetical on ENGINE.md:46.

- [x] ### Task 2: All-discuss stall test missing queue-persistence assertion
  **Priority:** Minor
  **Files:** `tests/engine/queue.test.ts:452-464`
  **Problem:** SPEC AC states "discuss rows are not removed from the queue — they remain with `status: 'pending'` after `popNextPending` is called." The test asserts `next === null` but does not read back the queue to verify D1 and D2 still exist with `status: "pending"`. If future code mutated the JSONL inside `popNextPending`, this AC would not be caught.
  **Fix:** After `assert.equal(next, null)`, add a readback assertion:

  ```typescript
  const after = await readQueue(root);
  assert.equal(after.length, 2);
  assert.ok(after.every((r) => r.status === "pending"));
  ```

  `readQueue` is already imported at line 9 of the test file.
  **Verify:** `npm test` passes with the new assertion. Manually confirm the test still passes (rows are unmodified by `popNextPending`).
  **Status:** ✅ Fixed
  **What was done:** Added `readQueue` readback after `assert.equal(next, null)` in `tests/engine/queue.test.ts:460-463`, asserting `after.length === 2` and all rows retain `status: "pending"`. 697 tests pass.
