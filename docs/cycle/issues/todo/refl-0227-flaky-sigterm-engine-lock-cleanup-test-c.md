---
id: refl-0227-flaky-sigterm-engine-lock-cleanup-test-c
title: Fix flaky SIGTERM engine-lock cleanup test with deterministic poll handshake
workflow: feature
depends_on: []
triaged_at: "2026-05-21T23:30:00.534Z"
source: triage
priority: high
---
## Context

Test at `tests/cli/engine-lock-integration.test.ts:209` ("SIGTERM → supervisor exits, lock cleaned up") intermittently fails with `AssertionError: lock should be absent after SIGTERM`. Introduced in cycle 0202; unrelated to cycle 0227's diff.

The race: a fixed sleep fires the lock-absence assertion before the subprocess completes the `unlink` under load or on a slow CI runner. `engine-lock.ts` carries a 100% coverage floor, making a flaky test here double-dangerous — it can mask real regressions in `acquireLock`/`releaseLock` and trains reviewers to ignore CI failures.

## Fix Direction

Replace the fixed sleep (or bare immediate assertion) with a `waitForAbsence` poll helper — consistent with the no-sleep policy in subprocess tests elsewhere in the suite.

Recommended implementation:

```ts
async function waitForAbsence(
  filePath: string,
  { timeout = 2000, interval = 50 }: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await stat(filePath);
    } catch (e: any) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Expected ${filePath} to be absent within ${timeout}ms`);
}
```

## Steps

1. Read `tests/cli/engine-lock-integration.test.ts` lines 190–240 to locate the current timing assumption (fixed sleep or bare assertion immediately after `process.kill`).
2. Identify the exact gap: SIGTERM send → lock unlink → assertion.
3. Add a `waitForAbsence` poll helper (or reuse an existing one if present) with 2 s timeout and 50 ms interval.
4. Replace the fixed sleep / direct assertion with `await waitForAbsence(lockPath)`.
5. Run the test 10 consecutive times in isolation to confirm no races:
   ```
   node --experimental-strip-types node_modules/.bin/vitest run tests/cli/engine-lock-integration.test.ts --reporter=verbose
   ```
6. Run full suite: `npm test`. Confirm coverage gates pass and `engine-lock.ts` remains at 100%.

## Acceptance Criteria

- Test passes in 10 consecutive isolated runs with no assertion failures.
- No fixed sleep remains in the SIGTERM cleanup assertion path.
- `npm test` green; `npm run check:coverage` passes with `engine-lock.ts` at 100%.
- `npm run check:invariants` passes.
