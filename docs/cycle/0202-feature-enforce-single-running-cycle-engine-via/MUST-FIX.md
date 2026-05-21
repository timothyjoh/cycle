# Must-Fix Items: Cycle 0202

## Summary
1 critical issue, 1 minor issue found in review.

## Tasks

- [x] ### Task 1: Add SIGTERM lock-release integration test
  **Priority:** Critical
  **Files:** `tests/cli/engine-lock-integration.test.ts`
  **Problem:** SPEC acceptance criterion #3 states "The lock is released on normal exit, SIGINT, **and SIGTERM**." The previous fix cycle added a SIGINT test (Task 1 from the prior MUST-FIX) but left SIGTERM untested end-to-end. The implementation is symmetric — `process.on("SIGTERM", () => process.exit(143))` triggers the `'exit'` event which calls `releaseLock` — but the SPEC explicitly names SIGTERM as a required test scenario.
  **Fix:** Add a fourth integration test in `tests/cli/engine-lock-integration.test.ts` modeled directly on the SIGINT test. Use the same slow-workflow + `tbd.jsonl` seeding pattern; replace `child.kill("SIGINT")` with `child.kill("SIGTERM")` and update the test name. While there, add a `Promise.race` timeout to both the SIGINT and SIGTERM tests so they don't hang indefinitely if the child fails to exit:

  ```typescript
  test("SIGTERM → supervisor exits, lock cleaned up", async () => {
    const dist = await ensureDist();
    const root = await mkdtemp(join(tmpdir(), "cycle-lock-sigterm-"));
    try {
      await bootstrapRepo(root);
      // same slow workflow setup as SIGINT test
      await writeFile(join(root, ".cycle", "workflows.yml"), slowWorkflowYml, "utf8");
      await writeFile(slowScript, "#!/bin/bash\nsleep 30\n", "utf8");
      await chmod(slowScript, 0o755);
      // seed todo + queue entry
      const todoId = "test-sigterm-issue";
      await writeFile(join(root, "docs/cycle/issues/todo", `${todoId}.md`), todoFm(todoId), "utf8");
      await appendFile(join(root, ".cycle/tbd.jsonl"), JSON.stringify(queueRow(todoId)) + "\n", "utf8");
      const lockPath = join(root, ".cycle", "engine.lock");
      const child = spawn("node", [dist, "run"], { cwd: root, stdio: "ignore" });
      // poll for lock (same as SIGINT test)
      let waited = 0;
      while (waited < 10_000) {
        try { await readFile(lockPath, "utf8"); break; } catch { /* not yet */ }
        await new Promise((r) => setTimeout(r, 100));
        waited += 100;
      }
      child.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((r) => child.on("exit", () => r())),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("child did not exit after SIGTERM")), 5_000)),
      ]);
      let lockExists = true;
      try { await readFile(lockPath, "utf8"); } catch { lockExists = false; }
      assert.equal(lockExists, false, "lock should be absent after SIGTERM");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```

  Extract the slow-workflow YAML and queue-row construction into local helpers to avoid duplicating them across SIGINT and SIGTERM tests.
  **Verify:** `npm test` shows a new passing test containing "SIGTERM" in the test name. `npm run test:coverage` continues to pass all gates.
  **Status:** ✅ Fixed
  **What was done:** Added SIGTERM test modeled on SIGINT test. Extracted `slowWorkflowYml`, `todoFm()`, `queueRow()`, and `waitForLock()` helpers shared by both signal tests. New test polls for lock, sends SIGTERM, and asserts lock file is absent.

- [x] ### Task 2: Add timeout to SIGINT exit wait
  **Priority:** Minor
  **Files:** `tests/cli/engine-lock-integration.test.ts:183`
  **Problem:** `await new Promise<void>((r) => child.on("exit", () => r()))` has no timeout. If the child process hangs after SIGINT (e.g., a bash subprocess ignores the signal), the test waits forever, blocking CI.
  **Fix:** Replace the bare exit promise with a `Promise.race` against a 5-second timeout, consistent with what Task 1 adds for SIGTERM:
  ```typescript
  await Promise.race([
    new Promise<void>((r) => child.on("exit", () => r())),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("child did not exit after SIGINT")), 5_000)
    ),
  ]);
  ```
  **Verify:** The SIGINT test still passes; `npm test` exit 0. The modified line is at `tests/cli/engine-lock-integration.test.ts` around line 183.
  **Status:** ✅ Fixed
  **What was done:** Replaced bare `child.on("exit")` promise with `Promise.race` against 5-second timeout. Also refactored SIGINT test to use extracted helpers, eliminating inline duplication.
