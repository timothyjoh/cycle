```markdown
# SPEC — Cycle 0022: engine.paused Event — Structured Payload With Per-Raw Failure Info

## Objective
Enrich the `engine.paused` event emitted by `src/engine/triage.ts` so a human (or future automation) reading `.cycle/log.jsonl` can see exactly which raw issues exhausted their retry budget and what error each one failed on — without re-running triage. Today the event carries only `{ reason: "triage_failed", failed }`, which tells the operator a pass died but not why per raw, forcing them to guess at recovery.

## Source Issue
`engine-paused-recovery-event-payload` — "engine.paused event: structured payload with per-raw failure info"

## Scope

### In Scope
- Capture and surface the final per-raw error message in the `engine.paused` event payload, alongside the list of failed raw ids and a canonical `reason` string. One additive change to a single emission site in `src/engine/triage.ts`.
- Test coverage for the new payload shape (full-fail, partial-fail, truncation).

### Out of Scope
- New CLI subcommands (deferred to `engine-paused-recovery-dry-run`).
- Documentation updates beyond CLAUDE.md (deferred to `engine-paused-recovery-docs`).
- Surfacing paused state inside `cycle status` (depends on the status command and is intentionally not bundled here).
- Changing exit codes, event ordering, or the conditions under which `engine.paused` fires.

## Requirements

### Functional
- `engine.paused` payload MUST include, in addition to current fields:
  - `reason: "all_triage_failed"` — literal string. Reserve other reason values for future use.
  - `raw_ids: string[]` — every raw id that exhausted its retry budget in this pass.
  - `last_errors: Array<{ raw_id: string, error: string }>` — one entry per `raw_ids` entry, **same length and same order**. `error` is the final validator / parse error message captured for that raw on its terminal attempt.
- The per-raw retry loop already carries forward the last error string to feed into the next prompt; reuse that same captured string for `last_errors[i].error` rather than re-deriving it.
- Each `error` string MUST be truncated to a cap of **2000 characters** (max) so a runaway stack trace cannot bloat the log. Truncation drops trailing characters; no marker required, but a `…` suffix is acceptable if the original was longer.
- `engine.paused` MUST emit exactly **once per pass**, immediately before the existing non-zero exit path. Not emitted on `--dry-run` (current behavior — triage is skipped entirely under `--dry-run`, no change needed).
- A pass where at least one raw succeeded MUST NOT emit `engine.paused`.
- The `failed` field currently on the payload may be kept (for any external readers) or replaced by `raw_ids`. **Decision:** keep `failed` as an alias of `raw_ids` for one release to avoid breaking any local log parsers; both fields contain the same array in the same order. (If no external readers exist, dropping `failed` is acceptable — note the choice in BUILD.md.)

### Non-functional
- No new dependencies.
- No change to event ordering, exit code, or to any event other than `engine.paused`.
- Truncation must be O(1) on string length (slice, not regex scan).

## Acceptance Criteria
- [ ] Unit test: triage pass where every raw fails all retries → emitted `engine.paused` has `reason: "all_triage_failed"`, `raw_ids` equal to the failed set, and `last_errors` of identical length and order, each with a non-empty `error` string drawn from the last retry attempt.
- [ ] Unit test: triage pass where at least one raw succeeds → no `engine.paused` event in the log.
- [ ] Unit test: a raw whose final error message exceeds the 2000-char cap is truncated to ≤ 2000 chars in `last_errors[i].error`; an error shorter than the cap passes through untouched.
- [ ] Unit test: `last_errors` order matches `raw_ids` order one-for-one (verify with at least 2 failed raws to make ordering observable).
- [ ] Coverage: line ≥ 95%, branch ≥ 75%, function ≥ 90%; no per-file regression vs master baseline.
- [ ] `npm test` and `npm run typecheck` clean.
- [ ] All existing triage tests still pass without modification beyond updating any assertions tied to the literal `"triage_failed"` reason string (callers that match on the prior reason are part of the diff).

## Testing Strategy
- Node's native test runner (`node --test`, spec reporter) — same framework as the rest of `tests/`.
- Drive triage through its public entry point (the existing `runTriage` / equivalent used by other triage tests) with a stub agent runner that:
  - Returns invalid output for every raw across all retry attempts (full-fail case) — captures distinct error strings per raw to exercise per-raw ordering.
  - Returns valid output for one raw and invalid for another (partial-fail case).
  - Returns an oversized error string (>2000 chars) for at least one raw (truncation case).
- Assertions read the emitted log entries via the existing in-memory log fixture used by sibling tests; assert payload shape with explicit deep-equality on `reason`, `raw_ids`, and `last_errors`.
- No new E2E surface — this is a payload shape change in an existing event; no UI involved.

## Documentation Updates
- **CLAUDE.md**: update the "Triage subroutine" bullet to note the enriched `engine.paused` payload shape (`reason`, `raw_ids`, `last_errors`) and the 2000-char truncation cap. One sentence is enough; this is a payload contract, not a workflow change.
- **README.md**: no change — `engine.paused` is an internal log event, not user-facing CLI surface.
- **RFC-001**: §5 already specifies the event-emission behavior at the level the RFC cares about; no edit needed unless the RFC enumerates payload fields (it does not today).

## Dependencies
- Existing per-raw retry loop in `src/engine/triage.ts` that already captures the last error string from each attempt. No new modules, no new env vars, no external services.
```
