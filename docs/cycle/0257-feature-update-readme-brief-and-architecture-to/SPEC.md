# SPEC — Cycle 0257: Update Rate-Limit Docs to Match Implementation

## Objective

`README.md`, `BRIEF.md`, and `docs/ARCHITECTURE.md` currently describe rate-limit behavior using placeholders, stale claims, and inaccurate event shapes — most notably `engine.paused { reason: "rate_limit" }` described as unimplemented, and an exit code `42` mentioned as the long-exhaustion signal. Cycle 0256 landed rate-limit detection and the pause/retry loop in the engine. This cycle updates all three documents so that the rate-limit sections match the shipped code exactly: correct event shapes, correct config key, correct retry semantics, and no references to unimplemented behavior.

## Source Issue

`mentor-rate-limit-docs-vs-code-docs-update` — "Update README, BRIEF, and ARCHITECTURE to reflect actual rate-limit behavior"

## Scope

### In Scope

- Update the rate-limit paragraph in `README.md` to describe actual retry behavior (in-process pause/retry loop, not exit 42).
- Update the rate-limit row in `BRIEF.md`'s failure-handling section to match implementation.
- Update `docs/ARCHITECTURE.md`: fix the JSONL event schema example (correct `engine.paused` shape with `retry_at`; add `engine.resumed`; remove the "not yet emitted" note); fix the failure-modes table row; update the exit-code entry in §3 Invocation Contract.

### Out of Scope

- Tightening the `"429"` substring false-positive risk in `isRateLimitError` (tracked separately in `raw/`).
- Any changes to engine code or tests.
- Documentation of features not yet built (PR creation, daemon, etc.).

## Requirements

- All three documents must describe `engine.paused { reason: "rate_limit", retry_at }` as currently emitted.
- All three documents must note that `engine.resumed { reason: "rate_limit_cleared" }` is emitted on first clean success after a rate-limited attempt.
- All three documents must state that rate-limit retries do not increment `consecutive_failures`.
- All three documents must document the `engine.rate_limit_backoff_ms` config key (default 3,600,000 ms = 1 hour).
- No document may claim exit code `42` is emitted on rate-limit — the retry loop is in-process and the engine does not exit on rate-limit pause.
- No document may describe rate-limit detection or the pause/retry loop as unimplemented, pending, or future work.
- The `docs/ARCHITECTURE.md` JSONL example block must include the corrected `engine.paused` and `engine.resumed` event lines and remove the `> **Note:**` caveat about these events not being emitted.

## Acceptance Criteria

- [ ] `README.md` rate-limit paragraph no longer mentions exit `42`; describes the in-process pause/retry loop.
- [ ] `BRIEF.md` rate-limit row in the failure-handling section no longer mentions exit `42`; describes `engine.paused { reason: "rate_limit" }` and in-process retry.
- [ ] `docs/ARCHITECTURE.md` §3 exit-code table no longer lists `42` as a rate-limit exit code (or removes the entry if the engine does not exit on rate-limit).
- [ ] `docs/ARCHITECTURE.md` JSONL event schema block shows `engine.paused { reason: "rate_limit", retry_at }` and `engine.resumed { reason: "rate_limit_cleared" }` without any "not yet emitted" caveat.
- [ ] `docs/ARCHITECTURE.md` failure-modes table describes the rate-limit rows accurately (in-process pause/retry, no attempt consumed, no exit 42).
- [ ] `engine.rate_limit_backoff_ms` config key and default (3,600,000 ms) are documented in at least one of the three files.
- [ ] No doc claims unimplemented behavior for rate-limit detection or the retry loop.
- [ ] `npm test` passes.

## Testing Strategy

- No new runtime tests are required — this cycle changes only documentation files.
- `npm test` must pass to confirm no regressions in the existing suite.
- Manual verification: grep `42` and `not yet emitted` across all three files to confirm removal.

## Documentation Updates

- **`README.md`**: Update "Rate limits" bullet in the "Failure handling" section.
- **`BRIEF.md`**: Update the rate-limit bullets in the "Branching, commit, and failure handling" section.
- **`docs/ARCHITECTURE.md`**: Update §3 exit-code table, §3 JSONL event schema block (remove caveat note), and §10 failure-modes table rate-limit rows.
- **`CLAUDE.md` / `AGENTS.md`**: No changes needed — `CLAUDE.md` already documents `engine.rate_limit_backoff_ms` and the retry loop accurately.

## Dependencies

- Cycle 0256 (`mentor-rate-limit-docs-vs-code-engine-integration`) must be merged to master — it landed `isRateLimitError`, wired it into exec modules, and implemented the pause/retry loop in `run-cycle.ts`. This cycle's documentation claims are only accurate after that code is present.
