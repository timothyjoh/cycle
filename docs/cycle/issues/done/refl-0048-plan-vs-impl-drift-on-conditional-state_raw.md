---
id: refl-0048-plan-vs-impl-drift-on-conditional-state
source: reflection
title: plan-vs-impl-drift-on-conditional-state-write
added_at: "2026-05-14T17:22:34.922Z"
triage_attempts: 0
priority_hint: 2
origin_cycle_id: "0048"
---

PLAN.md L43 specified 'If anything was copied, atomic-write the updated state map'; the implementation at `scripts/sync-defaults.mjs:123` writes the state file unconditionally on every run, including an all-divergent first run where it lands as `{}\n`. REVIEW.md noted this as benign. SPEC does not forbid either shape.

Why it matters: low — but PLAN-vs-impl drift in a freshly written file is the easiest kind to fix at write-time, and an unconditional empty `{}` file appearing after a fresh all-divergent run is a minor surprise for an operator running `git status`/`ls .cycle/`.

Suggested direction: either guard the write behind `copied.length > 0` to match PLAN, or update CLAUDE.md's `### sync-defaults divergence guard` to note that the state file is created even on an all-skip run. The doc fix is the cheaper move.
