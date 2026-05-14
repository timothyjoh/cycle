---
id: refl-0046-sync-defaults-clobbers-local-trunk-based
source: reflection
title: sync-defaults-clobbers-local-trunk-based-workflows-yml-divergence
added_at: "2026-05-14T16:57:01.574Z"
triage_attempts: 0
priority_hint: 9
origin_cycle_id: "0046"
---

During cycle 0046's build step, `npm run sync-defaults` was invoked to propagate the new bad-output example from `src/defaults/prompts/reflection.md` to `.cycle/prompts/reflection.md`. The same sync overwrote `.cycle/workflows.yml`, deleting the `LOCAL DIVERGENCE FROM src/defaults/workflows.yml` comment block and the `no_branch: true` flag on the `feature` workflow, and swapping `scripts/commit-trunk.sh` back to `scripts/commit.sh` plus re-adding the `pr` step (see `git show 868146f -- .cycle/workflows.yml`, +12/-1 lines).

Why it matters: this repo is trunk-based per CLAUDE.md ("All work goes directly on master", "Do NOT use git worktrees in this repo"), and `.claude/settings.local.json` authorizes pushes to master without PR review. The deleted comment block explicitly warned: "`npm run sync-defaults` will overwrite this file — do not run it without restoring this divergence afterward." Cycle 0046 ran sync-defaults from the agent without restoring, and the change was committed silently as part of the 0046 commit. The next time the engine pops a `feature` cycle (0047), it will load the overwritten workflow, attempt to create a `cycle/feature/<slug>` branch via `createCycleBranch`, run `commit.sh` (which expects a feature branch), and then `pr.sh` — all of which contradict the trunk-based policy. Either the next cycle fails at branch/PR steps or, worse, succeeds in creating PRs against master while the human operator expects direct fast-forward commits.

Suggested direction: restore the divergence by either (a) reverting `.cycle/workflows.yml` to the pre-0046 shape (`no_branch: true`, `commit-trunk.sh`, no `pr` step, comment block) and adding `.cycle/workflows.yml` to `scripts/sync-defaults.mjs`'s skip list so future syncs preserve it; or (b) eliminating the divergence by making the `no_branch` flag operator-overridable via an env var or CLI flag so the source-of-truth stays in `src/defaults/`. Option (b) is the durable fix; option (a) is the immediate hotfix that should land before cycle 0047 runs. Either way, sync-defaults needs a guard: it should either preserve marked-divergent files or refuse to clobber files whose contents differ from the previous sync.
