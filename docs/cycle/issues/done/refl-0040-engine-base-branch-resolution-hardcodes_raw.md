---
id: refl-0040-engine-base-branch-resolution-hardcodes
source: reflection
title: engine-base-branch-resolution-hardcodes-main
added_at: "2026-05-14T03:39:14.265Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0040"
---

Across cycles 0036/0037/0038, `cycle.checkout` and `cycle.base_pull` events emit `base: "main"` despite `.cycle/workflows.yml` declaring `master` (see `cycle.checkout` for 0038 in `.cycle/log.jsonl`). This produced `git checkout main failed: pathspec 'main' did not match any file(s) known to git`, killed cycle 0038's post-`pr` checkout, and re-surfaced at 0040's startup as `engine.warning {reason: resume_base_refresh_failed}`. Cycle 0040's BUILD.md explicitly names this `main`-vs-`master` engine-level bug as a remaining follow-up.

The engine's post-cycle checkout / resume base-refresh path is not reading the workflow's declared `base_branch` (or the per-todo frontmatter `base_branch` override) — it appears to fall back to a hardcoded `main`. Until fixed, any local trunk-based fork from `master` will hit the same warning every engine.start and lose the post-cycle base-pull.

Direction: trace the `base` source in `src/engine/run-cycle.ts` (post-cycle checkout / `cycle.base_pull` emission), `src/cli.ts` resume-base-refresh, and `src/engine/branch.ts` `pullBase`. Centralize on the workflow's `base_branch` and add a regression test using a `master`-only fixture that asserts `cycle.checkout.base === "master"`.
