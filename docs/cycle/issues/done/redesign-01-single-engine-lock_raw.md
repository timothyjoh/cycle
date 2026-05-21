---
id: redesign-01-single-engine-lock
source: text
title: Enforce single running cycle engine via PID lock with liveness check
added_at: "2026-05-21T02:42:44Z"
triage_attempts: 0
priority: critical
---

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §7.

## Problem

Nothing prevents two `cycle run` supervisors from running concurrently (e.g. a scheduled/looped run firing while one is still working). The engine loop is `popNextPending` then `markInProgress` — read-then-write, not atomic. Two supervisors can pop the same pending row; the second `markInProgress` throws `already in_progress … refusing to overwrite` (`src/engine/queue.ts:142`), which is unhandled in the main loop and crashes that supervisor. Two `run-one` children can also mutate the same working tree at once. This presents as "the engine spins out of control / dies for no clear reason."

## Approach

Acquire an exclusive runtime lock at the top of the `cycle run` supervisor (before triage / the drain loop), released on exit. A PID lockfile under `.cycle/` (e.g. `.cycle/engine.lock`) is the simplest mechanism:

- On start: if the lockfile exists and its PID is alive, exit with a clear message (`engine already running, pid N`). If the PID is dead (stale lock), reclaim it.
- Write our own PID, release on normal exit and on SIGINT/SIGTERM.
- The lockfile must be in the commit denylist (`src/engine/path-utils.ts`) — verify `.lock` suffix is already denied (it is) so it never gets committed.

This is independent of `run-one` (the inner runner) — the lock guards the *supervisor*.

## Acceptance Criteria

- [ ] A second `cycle run` started while one is active exits non-zero with a clear "already running" message and does NOT touch the queue.
- [ ] A stale lock (PID no longer alive) is reclaimed automatically; the engine starts normally.
- [ ] The lock is released on normal exit, SIGINT, and SIGTERM.
- [ ] Tests cover: live-lock rejection, stale-lock reclaim, release-on-exit.
- [ ] Recommended workflow: `feature`.
