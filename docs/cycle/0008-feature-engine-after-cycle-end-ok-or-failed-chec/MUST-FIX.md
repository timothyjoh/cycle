# Must-Fix Items: Cycle 0008

## Summary
0 critical issues, 4 minor test-quality issues. Implementation is sound; gaps are in adversarial test coverage of behaviors that PLAN claimed to verify but tests do not actually verify.

## Tasks

- [x] ### Task 1: Assert `cycle.end` precedes `cycle.checkout` ordering
  **Status:** ✅ Fixed
  **What was done:** Both checkout tests now split log into lines, find indices of `cycle.end` and `cycle.checkout` events, and assert `endIdx < checkoutIdx`. Existing `assert.match` calls preserved for payload-content verification.
  **Priority:** Minor
  **Files:** `tests/engine/run-cycle.test.ts`
  **Problem:** PLAN.md risk section line 175 claims "Tests assert this ordering via the regex sequence in the log." Current tests at `tests/engine/run-cycle.test.ts:91-92` and `:136-137` only call `assert.match(log, /cycle.end.../)` then `assert.match(log, /cycle.checkout.../)`. Both `assert.match` calls operate on the full buffer independently — they prove existence, not ordering. If emissions were swapped, the tests would still pass.
  **Fix:** In both `checks out base branch after successful cycle` and `checks out base branch after failed cycle` tests, after reading `log`, split into lines and assert ordering. Replace the two `assert.match` ordering pairs with:
  ```ts
  const lines = log.trim().split("\n");
  const endIdx = lines.findIndex(l => l.includes('"event":"cycle.end"'));
  const checkoutIdx = lines.findIndex(l => l.includes('"event":"cycle.checkout"'));
  assert.ok(endIdx !== -1 && checkoutIdx !== -1, "both events emitted");
  assert.ok(endIdx < checkoutIdx, `cycle.end (line ${endIdx}) must precede cycle.checkout (line ${checkoutIdx})`);
  ```
  Keep the existing `assert.match` calls for the event payload content (status, base, failing_step) since those still verify structure.
  **Verify:** Run `npm test`. Tests pass. Swap the order of the two `log.emit` calls in `src/engine/run-cycle.ts:66` and `:72` locally and confirm the test fails with the ordering assertion.

- [x] ### Task 2: Add test for `cycle.checkout status="failed"` branch
  **Status:** ✅ Fixed
  **What was done:** Added `logs cycle.checkout status=failed when base branch does not exist` test using `CYCLE_BASE: "no-such-base"`. Asserts HEAD stays on cycle branch, log emits `status:"failed","base":"no-such-base"`, and `reason` field includes git error text.
  **Priority:** Minor
  **Files:** `tests/engine/run-cycle.test.ts`
  **Problem:** `src/engine/run-cycle.ts:73-75` has a `catch` branch that emits `cycle.checkout` with `status: "failed"` and `reason` when the checkout itself fails. No test exercises this branch. PLAN explicitly puts dirty-tree out of scope, but the missing-base case is trivially testable and is the second supported failure mode in the implementation.
  **Fix:** Add a third test in `tests/engine/run-cycle.test.ts`:
  ```ts
  test("logs cycle.checkout status=failed when base branch does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
    const bin = await mkdtemp(join(tmpdir(), "cycle-bin-"));
    try {
      git(root, ["init", "-b", "main"]);
      git(root, ["config", "user.email", "t@t"]);
      git(root, ["config", "user.name", "t"]);
      git(root, ["commit", "--allow-empty", "-m", "init"]);

      await mkdir(join(root, ".cycle/workflows"), { recursive: true });
      await mkdir(join(root, ".cycle/prompts"), { recursive: true });
      await writeFile(join(root, ".cycle/workflows/feature.yaml"),
        `name: feature\nsteps:\n  - name: spec\n    agent: claudecode\n    prompt: prompts/spec.md\n`, "utf8");
      await writeFile(join(root, ".cycle/prompts/spec.md"), "spec body", "utf8");

      const fake = join(bin, "claude");
      await writeFile(fake, "#!/bin/bash\necho FAKED\n", "utf8");
      await chmod(fake, 0o755);

      const r = await runCycle(root, {
        issueId: "TEST-1",
        title: "spec the thing",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "no-such-base" },
      });
      assert.equal(r.status, "ok");

      // HEAD stays on cycle branch because checkout failed
      const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
      assert.equal(head, "cycle/feature/spec-the-thing");

      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"failed","base":"no-such-base"/);
      assert.match(log, /"reason":"git checkout no-such-base failed:/);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm test` passes with 59 tests. Temporarily remove the `try/catch` around `checkoutBase` in `src/engine/run-cycle.ts:70-75` and confirm the new test fails (runCycle should still return ok, but the failed-status checkout event is no longer emitted).

- [x] ### Task 3: Assert `head_before` field in `cycle.checkout` events
  **Status:** ✅ Fixed
  **What was done:** Both ok-path tests now match the full payload including `"head_before":"cycle\/feature\/spec-the-thing"`. A regression where `currentBranch` returns `null` would fail the regex.
  **Priority:** Minor
  **Files:** `tests/engine/run-cycle.test.ts`
  **Problem:** `src/engine/run-cycle.ts:72` and `:74` emit `head_before: headBefore`, a diagnostic field used for forensics per PLAN.md line 16. No test asserts the value. A regression where `currentBranch` always returns `null` (e.g., spawn error or wrong argv) would slip through.
  **Fix:** In both the "successful cycle" test (line 92) and the "failed cycle" test (line 137), strengthen the cycle.checkout regex to also match `head_before`:
  ```ts
  assert.match(log, /"event":"cycle.checkout","cycle_id":"0001","status":"ok","base":"main","head_before":"cycle\/feature\/spec-the-thing"/);
  ```
  **Verify:** `npm test` passes. Temporarily change `currentBranch` in `src/engine/run-cycle.ts:12` to `return Promise.resolve(null);` and confirm both tests fail with a regex-mismatch message naming `head_before`.

- [x] ### Task 4: Make existing happy-path test hermetic against parent `CYCLE_BASE`
  **Status:** ✅ Fixed
  **What was done:** Added `CYCLE_BASE: "main"` to the env of `runs a 2-step workflow end-to-end` at line 43. Test now hermetic; checkout emits `status:"ok","base":"main"` regardless of parent env.
  **Priority:** Minor
  **Files:** `tests/engine/run-cycle.test.ts`
  **Problem:** The pre-existing test `runs a 2-step workflow end-to-end` (line 15) does not pass `CYCLE_BASE` in `opts.env`. When this suite runs under the cycle engine itself, `process.env.CYCLE_BASE=master` leaks into `runCycle` (via the `process.env.CYCLE_BASE ?? "main"` fallback at `src/engine/run-cycle.ts:41`), and the temp repo (init -b main) lacks `master`, so `cycle.checkout` emits `status:"failed"` with `reason:"git checkout master failed: ..."` in test stdout. The assertion-set still passes because nothing asserts on the checkout event, but the test is no longer hermetic and pollutes test output with a misleading failure line. BUILD.md flagged this as a PLAN deviation in the new tests but did not fix the original test.
  **Fix:** Add `CYCLE_BASE: "main"` to the `env` of the existing happy-path test at `tests/engine/run-cycle.test.ts:43`:
  ```ts
  env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
  ```
  **Verify:** Run `CYCLE_BASE=master npm test 2>&1 | grep "cycle.checkout"`. The only `cycle.checkout` lines emitted should be `status:"ok","base":"main"` — no `base:"master"` and no `status:"failed"` from the happy-path test.
