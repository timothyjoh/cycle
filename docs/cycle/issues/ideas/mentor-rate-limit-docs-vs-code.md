---
id: mentor-rate-limit-docs-vs-code
title: "Remove phantom rate-limit handling claims from docs — engine.paused {reason: rate_limit} is not implemented"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 6
---

## Problem

`README.md`, `BRIEF.md`, and `docs/ARCHITECTURE.md` all describe rate-limit backoff and `engine.paused {reason: "rate_limit"}`:

> Rate limits are handled out of band: short transients back off in process; long exhaustion emits `engine.paused` and exits `42` for the caller to re-invoke later.

Searching the source (`src/engine/exec-claudecode.ts`, `exec-codex.ts`, `exec-spawn.ts`, `cli.ts`, `run-cycle.ts`), there is no code that:
- Inspects subprocess stderr for rate-limit patterns
- Emits `engine.paused { reason: "rate_limit" }`
- Exits with code `42`
- Implements any backoff

The exec modules resolve on process close with `code === 0 ? "ok" : "failed"`. A real rate-limit failure is treated as a step failure, increments `consecutive_failures`, and eventually halts the engine — not a clean `engine.paused`.

Documented-but-unimplemented behavior erodes trust in the documentation. An operator who reads this and expects `42` on rate limit will be confused when the engine halts instead.

## Fix

Remove or caveat the rate-limit claims in all three documents. Add a note that rate-limit detection is a known gap (issues surfaced by agent failure and resolved via the standard retry/halt path), with a pointer to the recommended workaround: set `max_consecutive_failures` high enough to absorb transient failures and re-invoke the engine after rate exhaustion.

Do NOT implement rate-limit detection in this cycle — that is a larger feature. This cycle's scope is documentation accuracy only.

## Acceptance Criteria

- [ ] `README.md` rate-limit claim updated: remove "back off in process" and "exits 42" language, replace with accurate description of what actually happens (step fails → retry → halt)
- [ ] `BRIEF.md` updated similarly
- [ ] `docs/ARCHITECTURE.md` updated similarly
- [ ] A "Known Limitations" or "Gaps" note added to one of the three docs listing rate-limit detection as unimplemented
- [ ] No source code changes (documentation only)
- [ ] All existing tests pass
