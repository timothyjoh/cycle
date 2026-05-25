---
id: mentor-sigterm-graceful-shutdown
title: "SIGTERM: emit cycle.killed before exit; emit cycle.restart on next invocation when open cycle detected"
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

This exits immediately with no log event. On next invocation, `readLogTail` sees an open `cycle.start` with no matching `cycle.end` and attempts resume — but there is no record of why the cycle is open, making it impossible to distinguish a crash from an intentional kill.

## Intended behavior

- **On SIGTERM**: emit `cycle.killed { cycle_id, ... }` to the log, then exit immediately (keep fast exit — no draining).
- **On next `cycle run`**: when `readLogTail` detects a `cycle.start` with no `cycle.end`, emit `cycle.restart { cycle_id, ... }` between the open start and the new work, then resume from the last completed step as today.

This gives operators and downstream tooling a definitive record: killed here, restarted here.

## Fix

1. In `src/cli.ts` SIGTERM handler: write `cycle.killed` event to the log before calling `process.exit(143)`.
2. In `src/engine/run-cycle.ts` (or wherever resume detection lives): when an open cycle is detected on startup, emit `cycle.restart` before continuing.
3. No draining, no grace period — fast exit is preserved.

## Acceptance Criteria

- [ ] SIGTERM emits `cycle.killed { cycle_id, timestamp }` to the event log before exit
- [ ] Process still exits immediately on SIGTERM (no drain, no subprocess wait)
- [ ] On next `cycle run`, an open cycle triggers a `cycle.restart` event in the log before work resumes
- [ ] `cycle.restart` is emitted only when a `cycle.start` has no matching `cycle.end` (not on clean starts)
- [ ] Engine lock is released cleanly on SIGTERM (existing `process.on("exit")` handler sufficient)
- [ ] SIGINT behavior is unchanged
- [ ] Tests cover: SIGTERM emits `cycle.killed`; next-run emits `cycle.restart` when open cycle detected
- [ ] All existing tests pass
