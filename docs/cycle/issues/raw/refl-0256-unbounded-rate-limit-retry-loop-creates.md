---
id: refl-0256-unbounded-rate-limit-retry-loop-creates
source: reflection
title: Unbounded rate-limit retry loop creates permanent hang under persistent throttle
added_at: "2026-05-26T10:27:02.460Z"
triage_attempts: 0
priority: medium
origin_cycle_id: "0256"
---

The `while(true)` retry loop in `run-cycle.ts` exits only on clean success or a non-rate-limit failure. If the underlying agent is permanently rate-limited (invalid API key, banned account, wrong endpoint), the engine will block indefinitely — emitting `engine.paused` every hour forever with no escape.

The 1-hour default backoff (`rate_limit_backoff_ms`) postpones but does not prevent the hang. A configurable `max_rate_limit_retries` (e.g., default 24 = 24 hours of retries) with a terminal `engine.halted { reason: "rate_limit_max_retries" }` would bound the blast radius. Alternatively, an operator-facing `cycle stop` already works as a manual escape hatch; documenting that in ENGINE.md is a lower-effort mitigation.

This was explicitly out of scope for cycle 0256 but is a real operational risk for any long-running queue.
