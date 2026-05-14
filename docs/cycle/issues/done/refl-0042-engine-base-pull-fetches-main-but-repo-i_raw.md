---
id: refl-0042-engine-base-pull-fetches-main-but-repo-i
source: reflection
title: engine-base-pull-fetches-main-but-repo-is-on-master
added_at: "2026-05-14T05:11:44.219Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0042"
---

Every cycle emits `cycle.base_pull {status:"failed", base:"main", reason:"git fetch origin main failed: fatal: couldn't find remote ref main"}` (see `.cycle/log.jsonl` tail at 04:04:07 after cycle 0041 and the same pattern earlier). The repo's default branch is `master` and the feature workflow already moved to `no_branch: true` (see `.cycle/workflows.yml` and commit `ddf3752`), so cycles complete fine — but the base-pull step still resolves the base as `main` and fires a failure event on every single cycle, polluting the audit log and obscuring real failures during triage of `engine.paused` / resume logic.

The `CYCLE_BASE=main` env var is still being set somewhere upstream of the CLI (visible in the env dump while reflection runs), and the engine appears to use it for `base_pull` independently of the per-workflow `no_branch` flag. Either (a) honor `no_branch: true` by skipping `base_pull` the same way `cycle.checkout` is skipped, or (b) source the base from the workflow's `base:` field and stop reading the legacy env default. Both are small changes; the current state means every future run carries a misleading failure event.
