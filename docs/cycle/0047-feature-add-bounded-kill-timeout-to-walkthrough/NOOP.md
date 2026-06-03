reason: already-satisfied

The SPEC's required bounded-kill timeout for the walkthrough hook spawn is
already fully implemented, wired, documented, and tested in HEAD.

## Evidence

- src/engine/walkthrough.ts:23 — `WALKTHROUGH_KILL_GRACE_MS = 5_000` (the 5s SIGTERM→SIGKILL grace).
- src/engine/walkthrough.ts:27 — `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS = 600_000` (documented, not auto-applied).
- src/engine/walkthrough.ts:33 — injectable `WalkthroughTimer` seam (the `timer`/`sleepFn`-style hook).
- src/engine/walkthrough.ts:101 — hook spawned `detached: true` so the kill reaches the process group.
- src/engine/walkthrough.ts:129 — `if (opts.timeoutMs && opts.timeoutMs > 0)` arms the SIGTERM→SIGKILL bounded-kill, marking `timedOut: true`.
- src/engine/run-cycle.ts:513 — defensive read of `engine.walkthrough_hook_timeout_ms` (0/negative/non-integer/NaN/Infinity/non-number ⇒ disabled).
- src/engine/run-cycle.ts:524 — timed-out hook routes through the fatal `step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }` path.
- src/engine/run-cycle.ts:323 — `formatWalkthroughTimeoutError` supplies the timeout-specific stderr referencing the actual exit code.
- src/engine/workflow.ts:60 — `walkthrough_hook_timeout_ms?: number` config field on the engine block.
- docs/ENGINE.md:273 — *Walkthrough capture* → *Bounded-kill timeout* documents the entire feature.
- tests/engine/walkthrough.test.ts:229 — test asserts SIGTERM→SIGKILL escalation and `timedOut/failed` resolution.
- tests/engine/walkthrough.test.ts:260 — test asserts `timeoutMs: 0` arms no timer (disabled-guard path).
