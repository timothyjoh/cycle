---
id: refl-0256-unbounded-rate-limit-retry-loop-creates-document-stop-escape
title: Document cycle stop as manual escape hatch for permanent rate-limit hang in ENGINE.md
workflow: feature
depends_on: []
triaged_at: "2026-05-26T11:08:27.501Z"
source: triage
priority: medium
parent: refl-0256-unbounded-rate-limit-retry-loop-creates
---
## Context

The `while(true)` retry loop in `src/engine/run-cycle.ts` exits only on clean success or a non-rate-limit failure. Under a permanent rate-limit condition (invalid API key, banned account, wrong endpoint), the engine emits `engine.paused { reason: "rate_limit", retry_at }` every hour indefinitely with no automatic escape.

`cycle stop` already terminates the engine and serves as a manual escape hatch, but this is not documented anywhere for operators.

## Task

Add an operator guidance section to `docs/ENGINE.md` in the rate-limit retry loop documentation block:

- Describe the unbounded retry behavior explicitly: loop exits only on clean success or a non-rate-limit failure
- Call out the permanent-hang risk: invalid API key, banned account, wrong endpoint all produce indefinite looping
- Document `cycle stop` as the escape hatch with example command
- Add guidance on diagnosing permanent vs transient throttle: e.g., repeated `engine.paused` events across multiple consecutive hours, or the agent failing immediately on retry rather than after processing

No code changes are required. This is a pure documentation fix providing immediate operator value until the `max_rate_limit_retries` cap is implemented.

## Acceptance criteria

- `docs/ENGINE.md` clearly documents the unbounded retry behavior and `cycle stop` escape hatch
- `npm test` passes with no changes to source or test files
