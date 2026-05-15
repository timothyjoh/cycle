---
id: refl-0067-brief-md-marker-insertions-split-mid-sen
source: reflection
title: brief-md-marker-insertions-split-mid-sentence-leaving-orphan-line-fragments
added_at: "2026-05-15T19:16:04.021Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0067"
---

The cycle 0067 diff on `BRIEF.md` inserts canonical markers via line-splits rather than at sentence boundaries — most visibly at lines 315-317 where the original `... plus a TEMPLATE.md. See Issue\nIngestion and Cycle Attempts...` becomes `... plus a TEMPLATE.md.\n(superseded — see RFC-001 § 12 BB-1)\nSee Issue\nIngestion ...`, and at lines 543-552 in the Phase 3 bullet where two markers land between sentences inside the same bullet, leaving short orphan lines (`Multi-cycle triage`, `See Issue`). BUILD.md acknowledges the deviation: '`-` lines (not just `+` and context) because Sites 1, 3, 4, and 5 split an existing physical line'. REVIEW.md passed it with 'modulo line-splits that the markers introduce.'

Markdown renderers collapse the soft wraps so visual output is fine, but the source is the canonical artifact that humans and agents read in diffs and in-editor. The SPEC's own per-site judgement table previously suggested the banner form for clustered hits (Phase 3) precisely to avoid this; the build chose inline everywhere and reviewer accepted. Suggested direction: a small follow-up pass converting the Phase 3 cluster to a single `> **Note:**` banner above the bullet and reflowing the Site 1 / Site 3 marker placements to sentence-end (not mid-sentence), preserving the same byte-identical marker string. Doc-only; no code path.
