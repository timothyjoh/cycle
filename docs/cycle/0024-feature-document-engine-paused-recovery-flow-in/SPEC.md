```markdown
# SPEC — Cycle 0024: Document engine.paused recovery flow

## Objective
Write the operator-facing recovery story for `engine.paused {reason: "all_triage_failed"}`. The enriched payload (cycle 0022) and `cycle triage --dry-run` (cycle 0023) shipped, but the lifecycle docs only describe how the engine pauses — not how a human gets it running again. This cycle closes the documentation gap by adding a recovery section to README, cross-linking it from RFC-001, and updating the CLAUDE.md triage quick-reference.

## Source Issue
`engine-paused-recovery-docs` — "Document engine.paused recovery flow in README + CLAUDE.md"

## Scope

### In Scope
- New `## Recovering from engine.paused` section in `README.md` with concrete inspection + iterate-with-dry-run + re-fire commands, plus delete-vs-edit guidance for malformed raws.
- Update `CLAUDE.md`'s `Triage subroutine` line to name the enriched payload fields (`reason`, `raw_ids`, `last_errors`) and the `cycle triage --dry-run` handle.
- Update `docs/RFC-001-issue-lifecycle.md` §5 to cross-link forward to the new README section.

### Out of Scope
- `cycle status` integration for paused state (deferred — belongs to a future cycle).
- Any engine code change. Docs-only. If a non-empty diff is needed for workflow gating, a single-line CHANGELOG entry under a new `## Unreleased` heading in `CHANGELOG.md` is the fallback.
- Re-ordering or rewriting unrelated README/CLAUDE.md/RFC sections.

## Requirements
- README section is self-contained: an operator who has never recovered an `engine.paused` before can follow it without reading CLAUDE.md or the RFC first.
- Every command shown is copy-pasteable and uses the canonical `./.cycle/bin/cycle.js` (or `cycle`) invocation form already used elsewhere in README.
- README explicitly states the safety guarantee — re-firing picks up cleanly because `raw/` and `tbd.jsonl` were never mutated by the failed pass.
- CLAUDE.md update lists the three payload fields (`reason`, `raw_ids`, `last_errors`) and names `cycle triage --dry-run` as the iteration handle. It stays under the existing `Triage subroutine` bullet — no new top-level section.
- RFC-001 §5 link points to the README section by anchor (`README.md#recovering-from-enginepaused`-style).
- No prose contradictions with the existing `engine.paused` description elsewhere in the doc set (re-read `docs/RFC-001-issue-lifecycle.md` §5 and `CLAUDE.md`'s `Triage subroutine` bullet before drafting).

## Acceptance Criteria
- [ ] `README.md` contains a `## Recovering from engine.paused` H2 with: payload description, inspection commands, `cycle triage --dry-run` iteration loop, delete-vs-edit guidance, and the safety guarantee statement.
- [ ] `CLAUDE.md`'s `Triage subroutine` bullet mentions `reason`, `raw_ids`, `last_errors`, and `cycle triage --dry-run`.
- [ ] `docs/RFC-001-issue-lifecycle.md` §5 contains a forward link to the README recovery section.
- [ ] If a code-touching diff is required to pass workflow gating, exactly one line is added under a new `## Unreleased` heading in `CHANGELOG.md`; otherwise no other file changes.
- [ ] `npm test` passes (no behavior changed, but the build hook still runs).
- [ ] `npm run typecheck` passes with no warnings.
- [ ] Coverage thresholds preserved (line ≥ 95%, branch ≥ 75%, function ≥ 90%) — docs-only changes should not regress.

## Testing Strategy
- No new unit tests. Docs-only cycle; existing suite (`npm test`) must remain green so the engine itself still builds and runs.
- Verification is editorial:
  - Re-read README section end-to-end as if from a paused-engine alert; confirm every step is actionable from the doc alone.
  - Grep for the three payload field names (`reason`, `raw_ids`, `last_errors`) in `README.md` and `CLAUDE.md` to confirm they appear.
  - Render the RFC anchor link locally (or visually verify the slug matches the H2) to confirm the cross-link resolves.
- No UI / E2E surface — skip Playwright.

## Documentation Updates
- **README.md**: new `## Recovering from engine.paused` section (primary deliverable).
- **CLAUDE.md**: extend the existing `Triage subroutine` quick-reference bullet with the enriched-payload field names and the `--dry-run` command.
- **docs/RFC-001-issue-lifecycle.md**: §5 cross-link to the README section.
- **CHANGELOG.md**: single-line `## Unreleased` entry if and only if the workflow requires a non-doc diff to pass.

Documentation is the deliverable here — code without updated docs would be incomplete, but in this cycle the docs *are* the code.

## Dependencies
- `engine-paused-recovery-event-payload` (cycle 0022) — landed. Payload fields `reason: "all_triage_failed"`, `raw_ids`, `last_errors` exist and are referenced verbatim in the new docs.
- `engine-paused-recovery-dry-run` (cycle 0023) — landed. `cycle triage --dry-run` command is the iteration handle the recovery flow leans on.
- No external services, no env vars, no new dependencies.
```
