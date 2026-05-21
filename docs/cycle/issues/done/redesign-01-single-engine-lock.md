---
id: redesign-01-single-engine-lock
title: Enforce single running cycle engine via PID lock with liveness check
workflow: feature
depends_on: []
triaged_at: "2026-05-21T03:05:32.599Z"
source: triage
---
## Context

RFC-003 §7 identifies a race condition in the supervisor: two concurrent `cycle run` instances can pop the same pending queue row, causing the second `markInProgress` call to throw `"already in_progress … refusing to overwrite"` — crashing that supervisor. Concurrent supervisors can also mutate the same working tree simultaneously, causing non-deterministic failures that surface as unexplained engine crashes.

## Problem

`src/engine/queue.ts:142` — `popNextPending` + `markInProgress` is a read-then-write, not atomic. Two supervisors racing this path produces:

- Second supervisor crashes on unhandled `markInProgress` throw in the main loop
- Two `run-one` children mutating the same working tree concurrently
- Presents externally as: engine spins out of control, dies for no apparent reason

Triggered in practice by scheduled/looped runs firing while a supervisor is still working.

## Approach

Write a PID lockfile at `.cycle/engine.lock` before triage and the drain loop start.

### Acquire logic

1. If `.cycle/engine.lock` does not exist → write our PID, proceed.
2. If it exists: read the stored PID.
   - `process.kill(pid, 0)` succeeds (process alive) → exit non-zero: `"engine already running, pid N"`.
   - `process.kill(pid, 0)` throws `ESRCH` (process dead) → stale lock; overwrite with our PID, proceed.
   - `process.kill(pid, 0)` throws `EPERM` (alive, no signal permission) → treat as alive, exit.

### Release logic

- Normal exit: delete `.cycle/engine.lock` in a `finally` block.
- `SIGINT` handler: `releaseLock`, then `process.exit(130)`.
- `SIGTERM` handler: `releaseLock`, then `process.exit(143)`.

### Denylist

Verify `.lock` suffix is already covered by `src/engine/path-utils.ts` `isDenied` — it is. No change needed there.

## Implementation Plan

### New file: `src/engine/engine-lock.ts`

Export two functions:

```typescript
// Acquires the PID lock. Throws with a clear message if a live lock exists.
export function acquireLock(lockPath: string): void

// Releases the lock (idempotent — no-op if file absent or belongs to another PID).
export function releaseLock(lockPath: string): void
```

`acquireLock` must perform the three-branch `process.kill(pid, 0)` check described above. `releaseLock` must be idempotent.

### Wiring in the supervisor

Locate the supervisor entry point (likely `src/cli/run-cycle.ts` or `src/cli.ts` `cycle run` handler):

1. Resolve `lockPath = path.join(cycleDir, 'engine.lock')`.
2. Call `acquireLock(lockPath)` before triage begins.
3. Register `process.on('SIGINT', ...)` and `process.on('SIGTERM', ...)` to call `releaseLock` then exit with the appropriate code.
4. Wrap the entire drain loop in `try { ... } finally { releaseLock(lockPath) }`.

## Acceptance Criteria

- [ ] A second `cycle run` started while one is active exits non-zero with `"engine already running, pid N"` and does NOT touch the queue.
- [ ] A stale lock (PID no longer alive, `ESRCH`) is reclaimed automatically; the engine starts normally.
- [ ] The lock is released on normal exit, SIGINT, and SIGTERM.
- [ ] Tests cover: live-lock rejection, stale-lock reclaim, release-on-exit, idempotent release.
- [ ] `src/engine/engine-lock.ts` registered in `scripts/coverage-gate.mjs` FLOORS table at 100% line coverage floor.
- [ ] `npm test` passes; coverage does not decrease from master baseline.

## References

- RFC-003: `docs/RFC-003-in-cycle-remediation-and-priority-routing.md` §7
- Queue race site: `src/engine/queue.ts:142`
- Denylist helper: `src/engine/path-utils.ts` `isDenied`
