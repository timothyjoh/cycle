---
id: engine-paused-recovery-event-payload
title: "engine.paused event: structured payload with per-raw failure info"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:12:56.383Z"
source: triage
parent: engine-paused-recovery
---
## Why

RFC-001 §5 specifies that when every raw issue fails triage in a single pass the engine emits `engine.paused` and exits. Today the event is thin: a human inspecting `.cycle/log.jsonl` cannot tell *why* triage failed for each raw without re-running. Recovery is guesswork.

Enrich the `engine.paused` event payload so the failure surface is self-describing and machine-readable.

## Scope

- Update `src/engine/triage.ts` (the only emitter of `engine.paused`) to include:
  - `reason: "all_triage_failed"` (literal string; reserve other reasons for future use)
  - `raw_ids: string[]` — every raw id that exhausted its retry budget in this pass
  - `last_errors: Array<{ raw_id: string, error: string }>` — the final validator/parse error message captured for each raw, one entry per `raw_ids` entry, same order
- Keep the existing event timestamp and any other current fields; only additive.
- The per-raw retry loop already captures the last error message to feed back into the next attempt — surface that same string in `last_errors`. Truncate to a sane cap (e.g. 2000 chars) so a runaway stack trace cannot bloat the log.
- Emit `engine.paused` *before* the non-zero exit, exactly once per pass. Do not emit it on `--dry-run`.

## Acceptance

- Unit test: simulate a triage pass where every raw fails all retries; assert the emitted `engine.paused` event has `reason`, `raw_ids` (matching the failed set), and `last_errors` (same length, same order, non-empty strings).
- Unit test: a pass that partially succeeds does NOT emit `engine.paused`.
- Unit test: truncation kicks in for an error string longer than the cap.
- Coverage thresholds hold (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- No change to exit code semantics or to the order in which other events fire.

## Out of scope

- New CLI subcommands (covered by `engine-paused-recovery-dry-run`).
- Documentation (covered by `engine-paused-recovery-docs`).
- Surfacing paused state in `cycle status` — depends on the status command landing first.
