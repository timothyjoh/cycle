---
id: refl-0028-brief-md-deprecated-folder-references-st
source: reflection
title: brief-md-deprecated-folder-references-still-unannotated
added_at: "2026-05-13T21:15:14.914Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0028"
---

PLAN's 'What We're NOT Doing' section explicitly defers `BRIEF.md` from the deprecated-folder sweep: '~9 deprecated-folder mentions there will be tracked as a follow-up issue (not filed in this cycle).' RESEARCH catalogued the lines (145, 310-311, 421, 456-457, 504, 527-528, 536, 538). Since the cycle 0028 SPEC framed itself as 'purge remaining pre-RFC-001 lifecycle vestiges' and `BRIEF.md` is in the repo root (the most visible doc to new contributors), leaving it as the only unannotated narrative doc is a coherence smell.

Direction: a small follow-up cycle that applies the same `(superseded — see RFC-001 § 12 BB-1)` annotation pattern to each `BRIEF.md` hit, or a top-of-file 'pre-RFC-001 historical context' banner if the surrounding paragraphs read as historical. Doc-only, no source changes, low risk.
