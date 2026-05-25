---
id: mentor-rate-limit-docs-vs-code-docs-update
title: Update README, BRIEF, and ARCHITECTURE to reflect actual rate-limit behavior
workflow: feature
depends_on: [mentor-rate-limit-docs-vs-code-engine-integration]
triaged_at: "2026-05-25T22:04:57.360Z"
source: triage
priority: medium
parent: mentor-rate-limit-docs-vs-code
---
## Problem

`README.md`, `BRIEF.md`, and `docs/ARCHITECTURE.md` describe rate-limit backoff (`engine.paused { reason: "rate_limit" }`, exit 42) as if implemented. After the engine-integration child lands, these docs can finally match reality.

## Task

Update all three files to:
- Confirm `engine.paused { reason: "rate_limit", retry_at }` is emitted and describe its shape.
- Confirm `engine.resumed { reason: "rate_limit_cleared" }` is emitted.
- Note that rate-limit events do not increment `consecutive_failures`.
- Document `engine.rate_limit_backoff_ms` config key (default 3600000 ms).
- Remove or correct any mention of exit 42 if that is not the actual signal used by the implementation.
- Ensure the behavior described matches the code landed in the engine-integration child.

## Acceptance Criteria

- [ ] README.md rate-limit section matches implementation
- [ ] BRIEF.md rate-limit section matches implementation
- [ ] docs/ARCHITECTURE.md rate-limit section matches implementation
- [ ] No doc claims unimplemented behavior
- [ ] `npm test` passes
