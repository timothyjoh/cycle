---
id: fix-flaky-lock-integration-teardown-enotempty
title: "Flaky test: engine-lock-integration SIGINT/SIGTERM teardown races descendant processes (ENOTEMPTY on rm)"
source: text
priority: medium
triage_attempts: 0
---

`tests/cli/engine-lock-integration.test.ts` intermittently fails CI in its temp-dir teardown, not in an assertion. It flaked the v0.2.0 publish run (1107/1108 passed; the one failure was this):

```
test at tests/cli/engine-lock-integration.test.ts:210
✖ SIGINT → supervisor exits, lock cleaned up
  [Error: ENOTEMPTY: directory not empty, rmdir '/tmp/cycle-lock-sigint-…'] { code: 'ENOTEMPTY' }
```

## Root cause
The signal tests (`SIGINT → …` and `SIGTERM → …`) spawn the supervisor (`node dist run`), which spawns a `run-one` child, which runs the slow bash step (`sleep 30`). The test signals the supervisor, waits for **the supervisor** to exit, asserts the lock is gone, then `finally`-runs `rm(root, { recursive: true, force: true })`. But the supervisor's **descendant processes** (the `run-one` child and its `sleep` bash) are not guaranteed dead the instant the supervisor exits. A still-exiting descendant writing into `root` (a log line, an artifact, a re-created file) races the `rm`: `rm` empties a directory, the live process drops a file back into it, and the final `rmdir` fails with `ENOTEMPTY`. `force: true` suppresses ENOENT, not this race.

## Fix
Make the teardown robust to the race (any one of these, prefer the first two):
1. **Add retries to the cleanup rm.** Node's `fs.rm` retries `ENOTEMPTY`/`EBUSY`/`EPERM` when given `maxRetries` + `retryDelay`:
   ```ts
   await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
   ```
   Apply to every temp-dir cleanup in this file (and any other test with the same spawn-the-engine-then-rm pattern).
2. **Wait for descendants to exit before cleanup.** After the supervisor exits, poll until no process has `root` open / the `run-one` + bash children are gone, then rm. (Heavier; option 1 usually suffices.)
3. If investigation shows the supervisor does **not** propagate the signal to its `run-one` child / bash grandchild (leaving orphans running `sleep 30`), that's a real signal-handling bug worth fixing too — the supervisor should tear down its process group on SIGINT/SIGTERM. Confirm whether the orphan is the cause; if so, fix the propagation (kill the child's process group) in addition to hardening the test.

## Acceptance
- The SIGINT and SIGTERM lock-integration tests pass reliably (run the file in a loop, e.g. 20x, with no ENOTEMPTY/EBUSY teardown failure).
- The assertions themselves are unchanged (lock cleaned up; `cycle.killed` logged for SIGTERM) — only the teardown is hardened, OR the signal propagation is fixed if option 3 applies.
- No new flakiness introduced elsewhere; full suite stays green.
