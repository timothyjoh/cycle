---
id: mentor-rate-limit-docs-vs-code
title: "Implement rate-limit detection: pause engine 1hr on rate limit, auto-resume when cleared"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 7
---

## Problem

Rate limits are a normal overnight event for an AFK engine. Today, a rate-limited step looks identical to a step failure: it increments `consecutive_failures` and eventually halts the engine. The engine does not recover — it dies and requires manual restart.

`README.md`, `BRIEF.md`, and `docs/ARCHITECTURE.md` all describe rate-limit backoff (`engine.paused { reason: "rate_limit" }`, exit 42) — none of it is implemented.

## Intended behavior

When a subprocess exits with a detectable rate-limit signal:

1. Emit `engine.paused { reason: "rate_limit", retry_at: <now + 1hr> }` to the event log.
2. Do NOT increment `consecutive_failures` — rate limits are not failures.
3. Sleep in-process for 1 hour.
4. Retry the same step.
5. Repeat until the step succeeds or a non-rate-limit failure occurs.

This lets the engine run overnight and resume at the earliest available moment after rate exhaustion clears.

## Rate-limit detection

Each exec module (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, etc.) should inspect subprocess stderr/stdout for provider-specific rate-limit signals:

- Claude Code / Anthropic: exit code 1 + stderr contains `"rate limit"` or `"429"` or `"Too Many Requests"`
- Codex / OpenAI: similar pattern
- Generic fallback: exit code 429 if the subprocess surfaces it

Detection should be encapsulated in a shared `isRateLimitError(result)` helper so each exec module calls a single function.

## Fix

1. Add `isRateLimitError(result: ExecResult): boolean` to a shared utility (e.g. `src/engine/rate-limit.ts`).
2. In each exec module, check `isRateLimitError` before treating the result as a failure.
3. In `src/engine/run-cycle.ts`, when a step returns a rate-limit signal: emit `engine.paused`, sleep 1hr (configurable via `engine.rate_limit_backoff_ms` in `workflows.yml` defaults), then retry.
4. Update docs to reflect the actual implemented behavior.

## Acceptance Criteria

- [ ] `isRateLimitError` detects rate-limit exit patterns for Claude Code and Codex
- [ ] Rate-limited step does not increment `consecutive_failures`
- [ ] `engine.paused { reason: "rate_limit", retry_at }` emitted on rate-limit detection
- [ ] Engine sleeps ~1hr (default; configurable) then retries the step automatically
- [ ] After rate limit clears, engine resumes and continues draining the queue
- [ ] `engine.resumed { reason: "rate_limit_cleared" }` emitted when retry succeeds
- [ ] README/BRIEF/ARCHITECTURE updated to reflect actual behavior
- [ ] Tests cover: rate-limit detection, pause event emission, retry after backoff
- [ ] All existing tests pass
