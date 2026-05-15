# SPEC — Cycle 0067: Annotate remaining deprecated-folder references in BRIEF.md

## Objective
Mark the 8 remaining `tbd/` / `queued/` / `triaged/` mentions in `BRIEF.md` as pre-RFC-001 historical via the canonical `(superseded — see RFC-001 § 12 BB-1)` marker (inline or banner). Closes the coherence smell left by cycle 0028's explicit deferral: RFC-001 and DOGFOOD.md are annotated; `BRIEF.md` is the last unannotated narrative doc.

## Source Issue
`refl-0028-brief-md-deprecated-folder-references-st` — "Annotate remaining deprecated-folder references in BRIEF.md as pre-RFC-001 historical"

## Scope

### In Scope
- Annotate every hit returned by `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md` (currently lines 315-316, 461-462, 509, 532, 541, 543) using the inline `(superseded — see RFC-001 § 12 BB-1)` marker, with the section-banner pattern (`> **Note:** This section describes the pre-RFC-001 lifecycle (superseded — see RFC-001 § 12 BB-1).`) substituted when 2+ contiguous hits in a single narrative paragraph would otherwise pepper per-line markers.
- Doc-only edit: diff touches `BRIEF.md` and nothing else.
- Re-run the grep at the end to confirm zero unannotated hits remain.

### Out of Scope
- Re-litigating RFC-001 § 12 BB-1.
- MVP plan doc (`docs/0001-mvp-plan.md` or similar) — separate follow-up.
- Cycle artifact dirs (`docs/cycle/0001-*/` … `docs/cycle/0028-*/`) and issue-record files under `docs/cycle/issues/{done,failed,blocked}/` — immutable per BB-1.
- Rewriting BRIEF.md prose beyond the annotation pattern.
- Touching ARCHITECTURE.md / CLAUDE.md / AGENTS.md / README.md (already annotated or out-of-scope per source issue).

## Requirements
- Marker text MUST be the canonical string `(superseded — see RFC-001 § 12 BB-1)` (en-dash, exact spacing, exact section ref). Banner form MUST be `> **Note:** This section describes the pre-RFC-001 lifecycle (superseded — see RFC-001 § 12 BB-1).`
- Inline placement: adjacent to the `tbd/`, `queued/`, or `triaged/` mention — same line or the immediately following line. Banner placement: as the first line of the historical paragraph or section, before any hit beneath it.
- Per-line judgement (banner vs inline) for each cluster:
  - **L315-316** (Artifacts & State, folder list): inline marker on the trailing `triaged/, blocked/, failed/ —` line; this is spec, not historical narrative, but the folder names themselves are superseded so the marker belongs on the same physical paragraph.
  - **L461-462** (Init scope, folder list): inline marker on the trailing `triaged/, blocked/, failed/ directories` line; same rationale as L315-316.
  - **L509** (Issue fetch, "writes a markdown file into `tbd/`"): inline marker on the `tbd/` mention.
  - **L532** (Phase 1, `tbd/ → queued/ → triaged/` lifecycle arrow): inline marker after the arrow — this is one tight historical lifecycle description so inline reads cleaner than a banner around a 2-line bullet.
  - **L541-543** (Phase 3, two hits: "External agents dropping files into `tbd/`" + "Pre-emptive `tbd/` rescans"): inline markers on each — they sit in separate sentences inside a bullet list, so one banner would over-scope. If the agent judges these as one historical narrative paragraph, a single banner above the Phase 3 bullet is also acceptable.
- Preserve all surrounding prose verbatim — wording, indentation, line breaks. The only insertions are marker text (and a banner line where chosen).
- File MUST still read as coherent narrative after the pass; if a hit's surrounding sentence becomes awkward, prefer banner over reflow.

## Acceptance Criteria
- [ ] `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md` shows every match adjacent to (same line / immediately following line) or beneath (same section banner with no intervening header) the canonical `(superseded — see RFC-001 § 12 BB-1)` marker.
- [ ] `git diff master -- BRIEF.md` is the only file changed; no source / test / defaults / other-doc edits.
- [ ] Marker string is byte-identical to `(superseded — see RFC-001 § 12 BB-1)` everywhere it appears (no smart-quote / hyphen drift).
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes with no new warnings.
- [ ] `npm run test:coverage` passes (per-file floor on `src/engine/triage.ts ≥ 95%` holds; doc-only change is coverage-neutral).
- [ ] BRIEF.md still renders as readable markdown (no orphaned banners, no broken bullets).

## Testing Strategy
- Doc-only change — no new unit / integration tests required and none would meaningfully exercise the edit.
- **Verification commands (run during `build` / `verify`)**:
  - `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md` — confirm every hit sits within the annotated radius.
  - `grep -nF '(superseded — see RFC-001 § 12 BB-1)' BRIEF.md` — confirm marker is byte-identical across all insertions.
  - `git diff --stat master -- BRIEF.md` — confirm BRIEF.md is the only file changed.
  - `npm test && npm run typecheck && npm run test:coverage` — sanity gates.
- No E2E / Playwright tests apply (no UI surface touched).

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: no change — neither doc mentions BRIEF.md's annotation state, and the canonical-marker pattern is already established by cycles 0028 (RFC-001 + DOGFOOD.md).
- **README.md**: no change — user-facing surface is unaffected.
- **BRIEF.md itself**: is the documentation update for this cycle.

## Dependencies
- Existing canonical marker pattern in `RFC-001` and `DOGFOOD.md` (cycle 0028 commit `3e0a502`) as the reference style.
- No external services, no env vars, no runtime changes.
