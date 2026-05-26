---
id: refl-0256-unbounded-rate-limit-retry-loop-creates-max-retries-cap
title: Add max_rate_limit_retries cap with engine.halted on exhaustion to bound the rate-limit retry loop
workflow: feature
depends_on: []
triaged_at: "2026-05-26T11:08:27.501Z"
source: triage
priority: medium
parent: refl-0256-unbounded-rate-limit-retry-loop-creates
---
## Context

The `while(true)` rate-limit retry loop in `src/engine/run-cycle.ts` is unbounded — it exits only on clean success or a non-rate-limit failure. Under a permanent rate-limit condition (invalid API key, banned account, wrong endpoint), the engine hangs indefinitely, emitting `engine.paused { reason: "rate_limit" }` every hour with no automatic termination.

A configurable retry cap bounds the blast radius and lets the engine self-heal rather than requiring operator intervention.

## Task

### 1. Config

Add `max_rate_limit_retries?: number` to `EngineConfig` in `src/engine/run-cycle.ts` (or wherever `EngineConfig` is defined). Default: `24` (24 hours at 1-hour backoff). Add to `src/defaults/engine.json` and run `npm run sync-defaults`.

### 2. Retry counter in runCycle

Track a `rateLimitRetries` counter alongside the existing retry loop. Increment on each rate-limited step result. When `rateLimitRetries > max_rate_limit_retries`:

- Emit `engine.halted { reason: "rate_limit_max_retries", retries: N, step_index: i }`
- Return a failed cycle result (do not continue draining)

### 3. Documentation

- Add `engine.max_rate_limit_retries` to the config table in `CLAUDE.md`
- Update `docs/ENGINE.md` rate-limit section to describe the cap and the `rate_limit_max_retries` halt reason

### 4. Tests

In `tests/engine/rate-limit-integration.test.ts`:

- Add a test where the agent rate-limits exactly `max_rate_limit_retries` times then succeeds — engine must NOT halt
- Add a test where the agent rate-limits `max_rate_limit_retries + 1` times — engine must emit `engine.halted { reason: "rate_limit_max_retries" }` and stop
- Verify the halted event carries correct `retries` count

## Acceptance criteria

- `EngineConfig.max_rate_limit_retries` exists with default `24`; wired into `engine.json` defaults
- Retry loop emits `engine.halted { reason: "rate_limit_max_retries" }` and terminates after cap is exceeded
- Integration tests cover the boundary (cap-1 succeeds, cap+1 halts)
- `npm run test:coverage` passes all coverage gates
- `npm test` passes
