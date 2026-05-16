---
id: refl-0084-cycle-base-pull-fails-on-every-cycle-wor
source: reflection
title: "cycle.base_pull fails on every cycle: workflows.yml base is `main`, repo branch is `master`"
added_at: "2026-05-16T02:03:37.810Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0084"
---

Every cycle emits `cycle.base_pull status:failed reason:"git fetch origin main failed: fatal: couldn't find remote ref main"`. The repo uses `master` as its trunk branch (confirmed by `CLAUDE.md` and git log), but the engine's configured `base` field resolves to `main`.

This fires silently after each cycle drain — the engine logs the failure but continues. No cycle has been blocked by it, but it means every post-cycle fetch-and-merge is a no-op, and the log accumulates spurious `status:failed` events that obscure real failures.

Fix: change `base:` in `.cycle/workflows.yml` (and likely `src/defaults/workflows.yml`) from `main` to `master`, or whichever value `git remote show origin` reports as the default branch.
