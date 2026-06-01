---
id: txt-20260601-162549-add-a-before-and-after-walkthrough-to-th
source: text
title: "Add a BEFORE-and-AFTER walkthrough to the bug-fix workflow: before the fix is applied, capture a video plus screenshot of the reproduced/broken behavior; after the fix, capture the corrected behavior; store BOTH clearly labeled before/after as cycle artifacts in docs/cycle/NNNN-.../. Target the fix-oriented 'quickfix' workflow in src/defaults/workflows.yml and run sync-defaults. Reuse the SAME optional repo-agnostic walkthrough hook mechanism as the feature-workflow walkthrough step (this builds on and shares that foundation); if no walkthrough hook is configured, skip cleanly without failing the cycle. Include tests and meet coverage floors."
added_at: 2026-06-01T16:25:49.680Z
triage_attempts: 0
priority: medium
---

Add a BEFORE-and-AFTER walkthrough to the bug-fix workflow: before the fix is applied, capture a video plus screenshot of the reproduced/broken behavior; after the fix, capture the corrected behavior; store BOTH clearly labeled before/after as cycle artifacts in docs/cycle/NNNN-.../. Target the fix-oriented 'quickfix' workflow in src/defaults/workflows.yml and run sync-defaults. Reuse the SAME optional repo-agnostic walkthrough hook mechanism as the feature-workflow walkthrough step (this builds on and shares that foundation); if no walkthrough hook is configured, skip cleanly without failing the cycle. Include tests and meet coverage floors.
