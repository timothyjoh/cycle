---
id: engine-paused-recovery-docs
title: Document engine.paused recovery flow in README + CLAUDE.md
workflow: feature
depends_on: [engine-paused-recovery-event-payload, engine-paused-recovery-dry-run]
triaged_at: "2026-05-13T18:12:56.383Z"
source: triage
parent: engine-paused-recovery
---
## Why

The new `engine.paused` payload and `cycle triage --dry-run` only help if operators know the recovery path. Today the lifecycle docs (`docs/RFC-001-issue-lifecycle.md`, `CLAUDE.md`, `README.md`) describe how the engine *pauses* but not how a human gets it running again.

Write the recovery story.

## Scope

- Add a `## Recovering from engine.paused` section to `README.md` covering:
  - What the `engine.paused` event payload now contains (link to `engine-paused-recovery-event-payload`).
  - How to inspect failed raws: read `.cycle/log.jsonl` tail, grep for `engine.paused`, inspect listed `raw_ids` and `last_errors`.
  - How to iterate on the triage prompt safely: `cycle triage --dry-run` until clean, then re-fire the engine.
  - When to delete vs. edit a raw (e.g. malformed source vs. legitimately ambiguous work).
  - That re-firing the engine will pick up cleanly because `raw/` and `tbd.jsonl` were never mutated by the failed pass.
- Update `CLAUDE.md`'s architecture quick-reference for `Triage subroutine` to mention the enriched payload and the dry-run command.
- Update `docs/RFC-001-issue-lifecycle.md` §5 to cross-link the recovery section.

## Acceptance

- README has a `Recovering from engine.paused` section with concrete commands.
- `CLAUDE.md` mentions the new event fields (`reason`, `raw_ids`, `last_errors`) and the `--dry-run` handle.
- RFC-001 §5 links forward to the README section.
- No code changes required; docs-only cycle. (If the workflow needs a code touch to produce a non-empty diff, add a single-line CHANGELOG entry under a new `## Unreleased` heading.)

## Out of scope

- `cycle status` integration for paused state — that work belongs to the existing `cli-drop-writes-to-raw-status-command` todo, which can pick up the new event fields once it lands.
