---
id: refl-0227-flaky-sigterm-engine-lock-cleanup-test-c
title: Fix flaky SIGTERM engine-lock cleanup test with deterministic handshake
workflow: feature
depends_on: []
triaged_at: "2026-05-21T15:10:05.163Z"
source: triage
---
## Context

Test at `tests/cli/engine-lock-integration.test.ts:209` ("SIGTERM → supervisor exits, lock cleaned up") intermittently fails with `AssertionError: lock should be absent after SIGTERM`. Introduced in cycle 0202; unrelated to cycle 0227's diff. BUILD.md records 663/0 but the cycle 0227 review runner observed the failure.

`engine-lock.ts` carries a **100% coverage floor**. A flaky test in this path is double-dangerous:
- Can mask real regressions in `acquireLock` / `releaseLock`
- Trains reviewers to ignore CI failures, eroding the signal value of the gate

## Root Cause Hypothesis

Fixed sleep between SIGTERM delivery and the lock-absence assertion. The subprocess receives the signal, begins cleanup, but the assertion fires before the unlink completes under load or on a slow CI runner.

## Fix Direction

Replace fixed sleep with a deterministic signal-to-cleanup handshake or short poll loop — consistent with the no-sleep policy in subprocess tests elsewhere in the suite. Options:

1. **Poll loop** — `waitForAbsence(lockPath, { timeout: 2000, interval: 50 })` style helper that resolves when `stat` returns ENOENT.
2. **IPC/stdout sentinel** — have the supervisor emit a line to stdout after cleanup; test reads it before asserting lock absence.
3. **Process exit wait** — await `process.exitCode` on the child handle; lock removal happens before exit, so a clean exit implies lock gone.

Option 1 (poll loop) is lowest friction and consistent with patterns already in the suite.

## Steps

1. Read `tests/cli/engine-lock-integration.test.ts` lines 190–240 to locate the current timing assumption (sleep or equivalent).
2. Identify the exact gap being papered over — SIGTERM send → lock unlink → assertion.
3. Implement a `waitForAbsence` poll helper (or reuse an existing one if present) with a 2 s timeout and 50 ms interval.
4. Replace the fixed sleep / direct assertion with the poll.
5. Run the test 10 consecutive times in isolation to confirm no races:
   ```
   node --experimental-strip-types node_modules/.bin/vitest run tests/cli/engine-lock-integration.test.ts --reporter=verbose
   ```
6. Run full suite: `npm test`. Confirm coverage gates pass and `engine-lock.ts` remains at 100%.

## Acceptance Criteria

- Test passes in 10 consecutive isolated runs with no assertion failures.
- No fixed sleep remains in the SIGTERM cleanup assertion path.
- `npm test` green; `npm run check:coverage` passes with `engine-lock.ts` at 100%.
- Structural invariants pass: `npm run check:invariants`.
