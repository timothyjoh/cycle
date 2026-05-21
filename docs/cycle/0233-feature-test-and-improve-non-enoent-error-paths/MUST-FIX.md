# Must-Fix Items: Cycle 0233

## Summary
1 critical issue: chmod-based test is root-sensitive with no guard, causing hard test failure in Docker CI environments running as root.

## Tasks

- [x] ### Task 1: Guard chmod test against root execution
  **Priority:** Critical
  **Files:** `tests/engine/queue.test.ts`
  **Problem:** The test at line 159 uses `chmod(join(root, ".cycle"), 0o555)` to trigger `EACCES` on `rename`. When `process.getuid()` is `0` (root), `chmod 0o555` does not prevent write access — `rename` succeeds, `bootstrapArchiveIfLegacy` resolves normally, and `assert.rejects` throws "Missing expected rejection". The test fails for the wrong reason with no diagnostic. This is a real failure mode in Docker CI containers that run as root.
  **Fix:** Add a root guard at the top of the test body, before `setupRoot()`. Use `node:test`'s `skip` via the test options or an early `return`:

  ```typescript
  test("bootstrapArchiveIfLegacy: non-ENOENT rename error is wrapped with context", async (t) => {
    if (process.getuid?.() === 0) {
      t.skip("chmod-based EACCES injection unreliable as root");
      return;
    }
    const root = await setupRoot();
    // ... rest unchanged
  ```

  Change the `test(name, async () => {` signature at line 159 to `test(name, async (t) => {` to receive the test context object. The `process.getuid` call is safe on all POSIX platforms; on Windows it returns `undefined`, so the optional-chaining guard `?.()` keeps the test active there.
  **Verify:** Run `sudo node --experimental-strip-types --test tests/engine/queue.test.ts 2>&1 | grep -E "skip|pass|fail"` — the test should report as skipped, not failed. Under normal (non-root) execution `npm test` must still pass with the test running and passing.
  **Status:** ✅ Fixed
  **What was done:** Changed test signature from `async ()` to `async (t)` and added `if (process.getuid?.() === 0) { t.skip(...); return; }` guard before `setupRoot()`. Full test suite: 696 pass, 0 fail. Coverage all floors met (queue.ts 96.77% ≥ 90%, dot-env.ts 100%).
