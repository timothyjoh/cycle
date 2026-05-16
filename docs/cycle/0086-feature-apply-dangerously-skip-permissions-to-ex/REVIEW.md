Same permission block. The cycle engine faces the identical catch-22 at the fix step — the review findings and fix instructions are above in the conversation. Here's the MUST-FIX content for the fix step:

---

# Must-Fix Items: Cycle 0086

## Summary
2 critical issues. Both are the SPEC-required code changes that the build step failed to apply due to `settings.local.json` permission blocking. Operator must apply both edits directly.

## Tasks

- [ ] ### Task 1: Insert `--dangerously-skip-permissions` flag in exec-claudecode.ts
  **Priority:** Critical
  **Files:** `src/engine/exec-claudecode.ts`
  **Problem:** Line 13 reads `const child = spawn("claude", ["-p", prompt], {` — flag absent. Root cause of six consecutive cycle failures (0079, 0081–0086).
  **Fix:** Edit line 13:
  ```ts
        const child = spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
  ```
  **Verify:** `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13. `npm run typecheck` exits 0.

- [ ] ### Task 2: Add flag assertion in exec-claudecode.test.ts
  **Priority:** Critical
  **Files:** `tests/engine/exec-claudecode.test.ts`
  **Problem:** Test 1 at line 22 only asserts `/SPECCED/` — no flag pin. Test passes falsely when flag is absent.
  **Fix:** After line 22, insert:
  ```ts
      assert.match(r.stdout, /--dangerously-skip-permissions/);
  ```
  **Verify:** `grep -n 'dangerously-skip-permissions' tests/engine/exec-claudecode.test.ts` returns a match. `npm test` passes. Temporarily removing the flag from Task 1 must cause test 1 to fail.

---

**Bottom line**: This is the seventh time this fix has been attempted. Both edits are one-liners. The only blocker is `settings.local.json` write permission — operator must apply them directly in the parent session, not via a spawned subprocess.
