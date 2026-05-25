---
id: mentor-sigterm-graceful-shutdown
title: "SIGTERM exits immediately, leaving in-flight cycle mid-step with no cycle.end event"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 7
---

## Problem

`src/cli.ts` registers:

```typescript
process.on("SIGTERM", () => process.exit(143));
```

This exits the engine immediately on `SIGTERM`, killing the in-flight `spawnRunOne` child process mid-step. The result:

1. No `cycle.end` event is emitted — the log tail shows an open `cycle.start` with no matching close.
2. On next invocation, `readLogTail` detects the open cycle and attempts resume from the last completed step — which is correct behavior, but only if the working tree is clean. An abrupt kill mid-step may leave partial file writes or uncommitted changes.
3. The engine lock is released (the `process.on("exit")` handler fires), but the in-progress queue row is not updated.

For a tool meant to run AFK and unattended (e.g. as a CI job that can be canceled), SIGTERM should drain cleanly.

## Fix

On SIGTERM:
1. Set a shutdown flag that the main drain loop checks after each `spawnRunOne` returns.
2. Kill the current `spawnRunOne` child with SIGTERM (not SIGKILL), give it a short grace period (5s), then SIGKILL if still running.
3. After the child exits, emit `cycle.end { status: "interrupted", cycle_id, ... }` to close the log tail.
4. Emit `engine.stop { status: "interrupted" }`.
5. Release the lock and exit 130.

This makes the interrupted cycle resumable on next invocation via the standard resume path, same as a crash.

## Acceptance Criteria

- [ ] SIGTERM causes the engine to stop after the current subprocess exits (or after 5s grace period)
- [ ] `cycle.end { status: "interrupted" }` is emitted when SIGTERM interrupts a running cycle
- [ ] `engine.stop { status: "interrupted" }` is emitted
- [ ] Engine lock is released cleanly
- [ ] Next `cycle run` resumes the interrupted cycle from the last completed step
- [ ] SIGINT behavior (exit 130) is unchanged
- [ ] Test coverage for the SIGTERM path
- [ ] All existing tests pass
