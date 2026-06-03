---
id: refl-0024-walkthrough-hook-spawn-has-no-timeout-ca
title: Add bounded-kill timeout to walkthrough hook spawn
workflow: feature
depends_on: []
triaged_at: 2026-06-01T17:44:40.083Z
source: triage
priority: high
noop_at: 2026-06-03T18:02:38.995Z
noop_reason: already-satisfied
noop_step: research
last_cycle_id: "0047"
---
## Problem

`execWalkthroughHook` (`src/engine/walkthrough.ts`) spawns the repo-provided walkthrough hook via `/bin/bash <abs>` and resolves only on the child's `close`/`error` events — **there is no timeout**. Every other step in the engine runs through `exec-spawn.ts`, which arms a `setTimeout` that escalates SIGTERM→SIGKILL and marks the result `timedOut` (`exec-spawn.ts`). The name-keyed `walkthrough_capture` intercept in `run-cycle.ts` `continue`s past that machinery, so the hook inherits none of it.

Walkthrough hooks are by design the scripts most prone to hanging — they boot headless browsers, wait on dev servers, and record video. A hook that never exits (a `wait-on` that never resolves, a browser that fails to close) will block `runCycle`, and therefore the entire engine, **indefinitely with no observable signal**. This directly undercuts the trustworthy-AFK-delivery direction: an unattended run would stall silently rather than fail and move on.

## Direction

Give `execWalkthroughHook` the same bounded-kill behavior as `exec-spawn.ts`:

- On spawn, arm a `setTimeout`; on expiry send SIGTERM, then escalate to SIGKILL after a grace period, and mark the result `timedOut` (mirror the existing escalation in `exec-spawn.ts`).
- Gate the timeout on a new `engine.walkthrough_hook_timeout_ms` config, read defensively at the read site: a sensible non-zero default; `0`/absent/non-integer/malformed ⇒ disabled (no timeout), consistent with how the other `engine.*` numeric configs degrade.
- Route a timed-out hook through the existing **fatal step-failure** path (`step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }`), with timeout-specific wording in the failure message/stderr (reference the actual signal/exit code, paralleling `formatTimeoutProofError`).
- Keep the existing best-effort collect/manifest-write semantics unchanged for the non-timeout success path.

## Tests

- Failure-path test driving a hook that sleeps past the threshold: assert SIGTERM→SIGKILL escalation, `timedOut` marking, the `step.end { status: "failed" }` / `cycle.end { status: "failed" }` ordering, and timeout-specific wording.
- A disabled-guard case (`walkthrough_hook_timeout_ms: 0`/absent) confirming no timeout is armed and the hook can run to completion.
- Make the timer injectable for tests (a `sleepFn`/timer seam, as `run-cycle.ts` already does for backoff) so the test does not depend on wall-clock.

Document the new config in `docs/ENGINE.md` → *Walkthrough capture* and the `engine.*` config list in `CLAUDE.md`, and hold the existing per-file coverage floor for `src/engine/walkthrough.ts` (95%).
