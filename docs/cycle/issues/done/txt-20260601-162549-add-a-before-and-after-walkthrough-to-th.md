---
id: txt-20260601-162549-add-a-before-and-after-walkthrough-to-th
title: Add before/after walkthrough capture to the quickfix bug-fix workflow
workflow: feature
depends_on: []
triaged_at: 2026-06-01T16:26:24.400Z
source: triage
priority: medium
noop_at: 2026-06-04T02:45:02.738Z
noop_reason: duplicate
noop_step: research
last_cycle_id: "0259"
---
Add a BEFORE-and-AFTER walkthrough to the fix-oriented `quickfix` workflow in `src/defaults/workflows.yml`.

## Goal

Capture the broken behavior before the fix is applied and the corrected behavior after, storing both as clearly labeled cycle artifacts.

## Scope

- **Before the fix is applied:** capture a video plus screenshot of the reproduced/broken behavior.
- **After the fix:** capture the corrected behavior (video + screenshot).
- Store BOTH artifacts, clearly labeled before/after, under the cycle's artifact directory (`docs/cycle/NNNN-.../`).
- Target the `quickfix` workflow specifically in `src/defaults/workflows.yml`, then run `npm run sync-defaults` to copy `src/defaults/` → `.cycle/`.

## Reuse the existing walkthrough hook

Reuse the SAME optional, repo-agnostic walkthrough hook mechanism already used by the feature-workflow walkthrough step — this builds on and shares that foundation rather than introducing a parallel mechanism. If no walkthrough hook is configured, the step must skip cleanly without failing the cycle (same opt-in / skip-clean semantics as the feature walkthrough).

## Acceptance

- `quickfix` workflow captures before (broken) and after (fixed) walkthrough artifacts, clearly labeled.
- Shared hook mechanism reused; absent hook ⇒ clean skip, no cycle failure.
- `src/defaults/workflows.yml` updated and `sync-defaults` run.
- Tests added in the same cycle; coverage floors met (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%, plus any per-file floors).
