---
id: refl-0221-file-artifact-mode-directive-insufficien
source: reflection
title: FILE ARTIFACT MODE directive insufficient — review step contaminated in cycle 0221 despite directive
added_at: "2026-05-21T11:51:17.645Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0221"
---

REVIEW.md for cycle 0221 contains narration (`"REVIEW.md output above is the file. MUST-FIX.md written to..."`) rather than structured review content. The FILE ARTIFACT MODE directive was prepended to `review.md` template in this cycle's build step, and the review step ran after build — so the directive was present when the review prompt executed. Contamination occurred anyway.

This proves that a user-turn-level directive at line 1 of the prompt template does not reliably override session-hook injection (`SessionStart` injecting learning-mode context). Cycles 0218, 0219, 0221 have each applied a new suppression mechanism (system-prompt append, runtime warning, inline directive) and contamination persists for the review step.

Suggested direction: investigate whether the review step receives a different session hook context, or whether the learning-mode hook actively suppresses FILE ARTIFACT MODE instructions. May require a structural fix at the session/hook layer rather than the prompt layer.
