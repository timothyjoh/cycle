---
id: mentor-sigterm-graceful-shutdown-emit-killed
title: "SIGTERM handler: emit cycle.killed event to log before exit"
workflow: feature
depends_on: []
triaged_at: "2026-05-25T22:05:52.187Z"
source: triage
priority: medium
parent: mentor-sigterm-graceful-shutdown
---
## Problem

`src/cli.ts` registers:

```typescript
process.on("SIGTERM", () => process.exit(143));
```

This exits immediately with no log event. There is no record that the cycle was intentionally killed vs. crashing, making crash/kill indistinguishable in the event log.

## Fix

In `src/cli.ts`, before calling `process.exit(143)`, write a `cycle.killed` event to the event log. The event should include `cycle_id` and `timestamp`.

Fast exit is preserved — no draining, no subprocess wait. The only addition is the log write before exit.

Engine lock release on exit is already handled by the existing `process.on("exit")` handler — do not change that.

## Acceptance Criteria

- [ ] SIGTERM handler writes `cycle.killed { cycle_id, timestamp }` to the event log before `process.exit(143)`
- [ ] Process exits immediately after the log write (no drain, no subprocess wait)
- [ ] SIGINT behavior is unchanged
- [ ] Engine lock still releases via the existing `process.on("exit")` handler
- [ ] Test: SIGTERM causes `cycle.killed` event to appear in the log
- [ ] All existing tests pass

## Notes

- Mirror the log-write pattern used by other event emitters in `src/cli.ts` or `src/engine/run-cycle.ts`
- `cycle_id` must be the active cycle's id at the time of the signal
- If no cycle is active when SIGTERM fires, emit the event with a null/undefined `cycle_id` rather than throwing
