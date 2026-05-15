---
id: refl-0067-brief-md-marker-insertions-split-mid-sen
title: Reflow cycle 0067 BRIEF.md marker insertions to sentence boundaries (Phase 3 banner + Site 1/3 sentence-end)
workflow: feature
depends_on: []
triaged_at: "2026-05-15T19:18:20.901Z"
source: triage
---
## Problem

The cycle 0067 diff on `BRIEF.md` inserts canonical `(superseded — see RFC-001 § …)` markers via mid-sentence line-splits rather than at sentence boundaries. Two concrete sites observed at HEAD:

- **Lines 315-317** — original `... plus a TEMPLATE.md. See Issue\nIngestion and Cycle Attempts...` was split into `... plus a TEMPLATE.md.\n(superseded — see RFC-001 § 12 BB-1)\nSee Issue\nIngestion ...`, leaving the marker between two halves of one logical sentence.
- **Lines 543-552** — the Phase 3 bullet now carries two markers landed between sentences inside the same bullet, leaving short orphan lines (`Multi-cycle triage`, `See Issue`).

BUILD.md acknowledged the deviation (`-` lines because Sites 1, 3, 4, and 5 split an existing physical line). REVIEW.md passed it ("modulo line-splits that the markers introduce"). The SPEC's own per-site judgement table previously suggested the banner form precisely for clustered hits like Phase 3.

## Why it matters

Markdown renderers collapse the soft wraps so visual output is fine, but the BRIEF.md **source** is the canonical artifact that humans and agents read in diffs and in-editor. Mid-sentence markers leave orphan line fragments that read poorly in raw form and in `git diff` review.

## Scope

Doc-only. No code path. No test changes.

## Acceptance

1. Phase 3 cluster (BRIEF.md lines 543-552 region) collapses its two inline markers into a single `> **Note:** (superseded — see RFC-001 § …)` banner placed above the affected bullet, preserving the same byte-identical marker string content for each superseded fact.
2. Site 1 (lines 315-317) and Site 3 marker placements are reflowed to sentence-end (no mid-sentence splits, no orphan `See Issue` / `Ingestion ...` line fragments).
3. Marker strings themselves are byte-identical to the cycle 0067 form — only their **placement** within BRIEF.md changes.
4. Sites 4 and 5 are reviewed for the same mid-sentence-split pattern and reflowed if affected; otherwise explicitly noted as already sentence-bounded.
5. Rendered output (any markdown renderer) shows no visual regression vs the cycle 0067 form.
6. No file outside `BRIEF.md` is touched.

## Notes

- See `docs/cycle/0067-feature-annotate-remaining-deprecated-folder-ref/BUILD.md` and `REVIEW.md` for the cycle 0067 deviation rationale and the per-site judgement table from the SPEC.
- Priority hint from reflection: 3 (low). Doc cosmetic; not blocking.
