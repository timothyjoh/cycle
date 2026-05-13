---
id: refl-0028-brief-md-deprecated-folder-references-st
title: Annotate remaining deprecated-folder references in BRIEF.md as pre-RFC-001 historical
workflow: feature
depends_on: []
triaged_at: "2026-05-13T21:16:13.822Z"
source: triage
---
Annotate the remaining deprecated-folder references in `BRIEF.md` (repo root, most contributor-facing narrative doc) with the canonical `(superseded — see RFC-001 § 12 BB-1)` marker, matching the pattern applied to RFC-001 and DOGFOOD.md in cycle 0028. Cycle 0028's PLAN explicitly deferred `BRIEF.md` from the deprecated-folder sweep: *"~9 deprecated-folder mentions there will be tracked as a follow-up issue (not filed in this cycle)."* This is that follow-up. Leaving `BRIEF.md` as the only unannotated narrative doc is a coherence smell now that RFC-001 and DOGFOOD.md are canonical.

## Scope

- Lines flagged by cycle 0028 RESEARCH: 145, 310-311, 421, 456-457, 504, 527-528, 536, 538. Re-verify line numbers before editing — the file may have shifted since 2026-05-13.
- For each hit, prefer an inline `(superseded — see RFC-001 § 12 BB-1)` marker adjacent to the `tbd/`, `queued/`, or `triaged/` mention, mirroring the RFC-001 inline pattern.
- Where 2+ contiguous hits read as historical narrative (e.g. a paragraph describing the pre-RFC-001 lifecycle), prefer a single top-of-section banner — `> **Note:** This section describes the pre-RFC-001 lifecycle (superseded — see RFC-001 § 12 BB-1).` — over peppering per-line markers.
- Doc-only. No source, no tests, no defaults.

## Acceptance

- `grep -nE '\b(tbd|queued|triaged)/' BRIEF.md` returns zero unannotated hits: every remaining match sits adjacent to (same line / next line) or beneath (same section banner) a `(superseded — see RFC-001 § 12 BB-1)` marker.
- Diff touches only `BRIEF.md`.
- `npm test`, `npm run typecheck`, and coverage gates pass (sanity — doc-only changes should be neutral on all three).
- BRIEF.md still reads as a coherent narrative; annotations should not bury the prose. If a section becomes unreadable, prefer the banner pattern.

## Out of scope

- Re-litigating RFC-001 § 12 BB-1.
- MVP plan doc (`docs/0001-mvp-plan.md` or similar) — separate follow-up if needed.
- Cycle artifact directories (`docs/cycle/0001-*/` … `docs/cycle/0028-*/`) and issue-record files under `docs/cycle/issues/{done,failed,blocked}/` — immutable per BB-1 convention.
- Rewriting BRIEF.md prose beyond the annotation pattern.

## Origin

Reflection from cycle 0028 (priority_hint: 4). Cycle 0028 PLAN's *"What We're NOT Doing"* section explicitly deferred this. Pattern to mirror: see cycle 0028 commit `3e0a502` for RFC-001 and DOGFOOD.md annotations.
