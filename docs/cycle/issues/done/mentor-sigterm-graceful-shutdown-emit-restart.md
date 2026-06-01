---
id: mentor-sigterm-graceful-shutdown-emit-restart
title: "Resume detection: emit cycle.restart event when open cycle detected on next run"
workflow: feature
depends_on: [mentor-sigterm-graceful-shutdown-emit-killed]
triaged_at: "2026-05-25T22:05:52.187Z"
source: triage
priority: medium
parent: mentor-sigterm-graceful-shutdown
---
## Problem

When `cycle run` starts and `readLogTail` finds a `cycle.start` with no matching `cycle.end`, the engine resumes the open cycle but emits no event marking the resumption. Operators and downstream tooling cannot distinguish a clean start from a resume-after-kill or resume-after-crash.

## Fix

In `src/engine/run-cycle.ts` (or wherever resume detection lives via `readLogTail`), when an open cycle is detected on startup:

1. Emit `cycle.restart { cycle_id, timestamp }` into the event log before any new work begins
2. Then resume from the last completed step as normal

`cycle.restart` must only be emitted when a `cycle.start` has no matching `cycle.end`. Clean starts must not emit it.

## Acceptance Criteria

- [ ] `cycle.restart { cycle_id, timestamp }` is emitted when an open cycle (start with no end) is detected on `cycle run`
- [ ] `cycle.restart` is NOT emitted on clean starts
- [ ] The restart event appears in the log before any new work events for that run
- [ ] Resume behavior is otherwise unchanged
- [ ] Test: after simulating a killed cycle (open start, no end), next `cycle run` emits `cycle.restart`
- [ ] Test: clean start does not emit `cycle.restart`
- [ ] All existing tests pass

## Notes

- After completing `mentor-sigterm-graceful-shutdown-emit-killed`, a killed cycle will have `cycle.killed` in the log; `cycle.restart` detection is still keyed on the open-start heuristic (no matching end), not on the presence of `cycle.killed`
- This ensures resume-after-crash also gets a `cycle.restart` marker, not only resume-after-SIGTERM
