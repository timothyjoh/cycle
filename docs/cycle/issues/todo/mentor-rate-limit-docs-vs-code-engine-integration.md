---
id: mentor-rate-limit-docs-vs-code-engine-integration
title: Wire rate-limit detection into exec modules and run-cycle pause/retry loop
workflow: feature
depends_on: [mentor-rate-limit-docs-vs-code-rate-limit-detector]
triaged_at: "2026-05-25T22:04:57.360Z"
source: triage
priority: medium
parent: mentor-rate-limit-docs-vs-code
---
## Problem

Rate-limited steps increment `consecutive_failures` and can halt the engine. The engine has no pause/retry loop for rate limits. `engine.paused { reason: "rate_limit" }` and `engine.resumed { reason: "rate_limit_cleared" }` are documented but never emitted.

## Task

### 1. Exec modules

In each exec module (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`): import `isRateLimitError` from `../engine/rate-limit.ts` and return a distinct signal (e.g. `{ rateLimited: true }` or a dedicated `StepResult` field) instead of treating the result as a step failure when `isRateLimitError(result)` is true.

### 2. run-cycle.ts

When a step returns a rate-limit signal:
1. Do NOT increment `consecutive_failures`.
2. Compute `retry_at = Date.now() + backoffMs` where `backoffMs` defaults to `3_600_000` (1 hr) and is overridable via `engine.rate_limit_backoff_ms` in `workflows.yml` defaults.
3. Emit `engine.paused { reason: "rate_limit", retry_at: new Date(retry_at).toISOString() }` to the event log.
4. Sleep `backoffMs` ms.
5. Retry the same step.
6. Repeat until step succeeds or returns a non-rate-limit failure.
7. On first successful retry, emit `engine.resumed { reason: "rate_limit_cleared" }`.

### 3. workflow defaults

Add `engine.rate_limit_backoff_ms: 3600000` to `src/defaults/workflows.yml`. Run `npm run sync-defaults` after.

## Acceptance Criteria

- [ ] `isRateLimitError` used in all exec modules
- [ ] Rate-limited step does not increment `consecutive_failures`
- [ ] `engine.paused { reason: "rate_limit", retry_at }` emitted
- [ ] Engine sleeps configurable backoff then retries
- [ ] `engine.resumed { reason: "rate_limit_cleared" }` emitted on recovery
- [ ] `engine.rate_limit_backoff_ms` wired into defaults
- [ ] Tests cover: pause event emission, no consecutive_failures increment, retry after backoff, resumed event
- [ ] `npm test` passes; coverage floors maintained
