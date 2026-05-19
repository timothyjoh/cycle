# Must-Fix Items: Cycle 0113

## Summary
1 critical issue: branch coverage on `src/engine/issue-lifecycle.ts` is 46.15% (7 of 13 branches
untested). The per-file coverage gate passes (line coverage 97.53% ≥ 95% floor) but branch
coverage is masked by the 91.47% aggregate floor. Two of the uncovered branches are reachable
with real filesystem; add tests for them.

## Tasks

- [x] ### Task 1: Add test for happy-path rename ENOENT branch (lines 74–75)
  **Status:** ✅ Fixed
  **What was done:** Added `setupRepoNoFailedDir()` helper that omits `failed/` dir creation. Added test `"terminalDrain: happy path — rename ENOENT swallowed when failedDir absent"` asserting `queue.drained` emitted, `queue.drain_warning` absent, and `failed/<issueId>.md` does not exist. Branch coverage for lines 73–75 now covered.
  **Priority:** Critical
  **Files:** `tests/engine/issue-lifecycle.test.ts`
  **Problem:** `src/engine/issue-lifecycle.ts:73–76` — the `catch` block on the happy-path
  `rename(todoPath, failedPath)` is never entered because `setupRepo()` always creates
  `failedDir`. Lines 74–75 are reported uncovered (red in `npm run test:coverage` output).
  The branch where `rename` throws ENOENT (swallowed) is untested, leaving 2 branches dark.
  **Fix:** Add a third test in `tests/engine/issue-lifecycle.test.ts`:

  ```
  test("terminalDrain: happy path — rename ENOENT is swallowed when failedDir absent", async () => {
  ```

  Setup: call `setupRepo()` as usual but do NOT create `docs/cycle/issues/failed/` (remove that
  `mkdir` call or use a separate helper that omits it). Write `todo/<issueId>.md` with valid
  frontmatter. Seed queue. Call `terminalDrain(...)`.

  Assert:
  - `queue.drained` event emitted with `outcome: "terminal"` (drain continues past the catch)
  - `queue.drain_warning` NOT emitted (still the happy path — mutateFrontmatter succeeded)
  - `failed/<issueId>.md` does NOT exist (rename was swallowed — file never moved)

  The third assertion is optional but makes the test's intent clear. The rename ENOENT is
  swallowed at lines 74–75; execution continues to `drainFailedTerminal` and `propagateBlocked`
  normally.

  **Verify:** `npm run test:coverage` — `src/engine/issue-lifecycle.ts` branch coverage rises
  above 60%. Lines 74–75 no longer appear in the uncovered-lines list.

- [x] ### Task 2: Add test for fallback parseFrontmatter catch branch (line 45)
  **Status:** ✅ Fixed
  **What was done:** Added test `"terminalDrain: fallback path — parseFrontmatter failure uses raw bytes as body"`. Key insight: writing a file with no frontmatter block causes `parseFrontmatter` to throw `"no frontmatter"` inside `mutateFrontmatter` (setting `mutateErr`), and the same content causes the catch at line 45 to fire in the fallback. No chmod needed. Asserts `queue.drain_warning` emitted, `failed/<issueId>.md` exists, `drain_error` is a string. `issue-lifecycle.ts` branch coverage rose to 73.33% (from 46.15%).
  **Priority:** Critical
  **Files:** `tests/engine/issue-lifecycle.test.ts`
  **Problem:** `src/engine/issue-lifecycle.ts:41–47` — the `catch` block around
  `parseFrontmatter(originalBody)` is never entered. In Test 2, `originalBody = ""` (readFile
  threw ENOENT → caught → body stays `""`); `parseFrontmatter("")` returns without throwing, so
  the `catch` is skipped. The branch where `parseFrontmatter` throws is dark.
  **Fix:** Add a fourth test in `tests/engine/issue-lifecycle.test.ts`:

  ```
  test("terminalDrain: fallback path — parseFrontmatter failure uses raw bytes", async () => {
  ```

  Setup: call `setupRepo()` and write a `todo/<issueId>.md` whose content starts with `---` but
  contains content that `parseFrontmatter` rejects (e.g. a bare `---` open delimiter with no
  closing `---`, so the parser throws). Seed queue. **Do NOT write this as a valid frontmatter
  block.** Then trigger the fallback by writing a file that `mutateFrontmatter` will reject —
  simplest: write the file, then delete it AFTER `mutateFrontmatter` has been set up to fail.

  Alternative approach (simpler): use a non-existent todoPath (same trigger as Test 2, ENOENT
  on mutateFrontmatter), but separately write an existing file at todoPath whose content has a
  malformed frontmatter block that parseFrontmatter throws on — i.e., create the file BEFORE
  mutateFrontmatter runs so mutateFrontmatter fails for a different reason, OR use a file with
  invalid YAML in its front matter and trigger mutateFrontmatter failure via some other means.

  Simplest concrete approach: write a `todo/<issueId>.md` with content `"---\ninvalid: [\n---\n"`
  (unclosed YAML array), then trigger mutateFrontmatter failure by making the file read-only
  (chmod 0444) so mutateFrontmatter can't write it. After `terminalDrain` call, chmod back and
  assert `failed/<issueId>.md` exists, `drain_error` is a string, `queue.drain_warning` emitted.

  **Verify:** `npm run test:coverage` — the `catch` block at line 45 is entered; branch
  coverage for `src/engine/issue-lifecycle.ts` rises further (target: above 70%).

  **Note:** If triggering parseFrontmatter throw requires filesystem permission manipulation
  (chmod), that is acceptable — it is not mocking, just real-world failure simulation. Clean up
  chmod in `finally` before `rm(root)`.
