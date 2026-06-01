---
id: refl-0024-walkthrough-hook-spawn-has-no-timeout-ca
source: reflection
title: walkthrough-hook-spawn-has-no-timeout-can-hang-engine
added_at: 2026-06-01T17:39:42.620Z
triage_attempts: 1
priority: high
origin_cycle_id: "0024"
---

`execWalkthroughHook` (src/engine/walkthrough.ts:42-58) spawns the repo-provided hook via `/bin/bash` and resolves only on the child's `close`/`error` events — there is no timeout. Every other step in the engine runs through `exec-spawn.ts`, which arms a `setTimeout` that escalates SIGTERM→SIGKILL and marks the result `timedOut` (exec-spawn.ts:80-84). The name-keyed `walkthrough_capture` intercept in run-cycle.ts `continue`s past that machinery, so the hook inherits none of it.

Walkthrough hooks are by design the scripts most prone to hanging — they boot headless browsers, wait on dev servers, and record video. A hook that never exits (a `wait-on` that never resolves, a browser that fails to close) will block `runCycle`, and therefore the entire engine, indefinitely with no observable signal. This directly undercuts the trustworthy-AFK-delivery direction: an unattended run would stall silently rather than fail and move on.

Suggested direction: give `execWalkthroughHook` the same bounded-kill behavior as `exec-spawn.ts` (SIGTERM then SIGKILL after a grace period, mark `timedOut`), gated by a new `engine.walkthrough_hook_timeout_ms` config (defensively read, sensible non-zero default, 0/absent ⇒ disabled), and route a timed-out hook through the existing fatal step-failure path with timeout-specific wording. Add a failure-path test driving a hook that sleeps past the threshold.
