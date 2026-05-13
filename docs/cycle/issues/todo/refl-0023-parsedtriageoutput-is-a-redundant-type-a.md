---
id: refl-0023-parsedtriageoutput-is-a-redundant-type-a
title: Remove redundant ParsedTriageOutput type alias in triage.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:46:49.725Z"
source: triage
---
## Context

REVIEW.md from cycle 0023 (`docs/cycle/0023-feature-cycle-triage-dry-run-test-triage-prompt/`) Code-Quality Finding 4 flagged `ParsedTriageOutput` at `src/engine/triage.ts:65` as a type alias for `TriageOutput` declared in the same file. The alias adds a second name without a semantic distinction, so future edits to one type can silently drift from the other.

## Goal

Collapse the alias so there is one canonical name. Two acceptable shapes:

1. **Inline + delete** (preferred if the parse-vs-validated axis is not meaningful here): replace every reference to `ParsedTriageOutput` with `TriageOutput`, then delete the `type ParsedTriageOutput = ...` line.
2. **Rename to encode the axis** (if parse-result vs validated-result is a real distinction the code wants to enforce): rename one of the pair so the names carry meaning (e.g. `RawTriageOutput` for the just-parsed JSON shape vs `TriageOutput` for the validated form), and update use sites accordingly.

Pick (1) unless reading the validator makes (2) obviously the right call.

## Acceptance

- Only one of `TriageOutput` / `ParsedTriageOutput` remains in `src/engine/triage.ts` (or, under option 2, both remain but with semantically distinct names and types).
- All call sites compile clean under `npm run typecheck` with no warnings.
- `npm test` passes; `npm run test:coverage` shows no regression vs the master baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%).
- No behavioral change — this is a pure rename/inline.

## Out of scope

- Restructuring the validator pipeline.
- Changing the JSON contract emitted by the triage agent.
- Touching other type aliases in `triage.ts` that are not the `ParsedTriageOutput` ↔ `TriageOutput` pair.
