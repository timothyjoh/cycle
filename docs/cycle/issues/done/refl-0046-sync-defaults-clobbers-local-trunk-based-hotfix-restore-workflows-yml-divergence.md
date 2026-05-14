---
id: refl-0046-sync-defaults-clobbers-local-trunk-based-hotfix-restore-workflows-yml-divergence
title: "Hotfix: restore .cycle/workflows.yml trunk-based divergence before next feature cycle runs"
workflow: feature
depends_on: []
triaged_at: "2026-05-14T17:00:46.864Z"
source: triage
parent: refl-0046-sync-defaults-clobbers-local-trunk-based
---
## Problem

Cycle 0046's build step ran `npm run sync-defaults` to propagate the new bad-output example into `.cycle/prompts/reflection.md`. The same sync also overwrote `.cycle/workflows.yml` and silently committed (`git show 868146f -- .cycle/workflows.yml`, +12/-1):

- deleted the `LOCAL DIVERGENCE FROM src/defaults/workflows.yml` comment block (which explicitly warned: "`npm run sync-defaults` will overwrite this file — do not run it without restoring this divergence afterward");
- removed `no_branch: true` from the `feature` workflow;
- swapped `scripts/commit-trunk.sh` back to `scripts/commit.sh`;
- re-added the `pr` step.

The next time the engine pops a `feature` cycle (0047), it will load the overwritten workflow, attempt to create a `cycle/feature/<slug>` branch via `createCycleBranch`, run `commit.sh` (which expects a feature branch), and then `pr.sh` — all of which contradict the trunk-based policy enshrined in CLAUDE.md ("All work goes directly on master", "Do NOT use git worktrees in this repo") and `.claude/settings.local.json` (master push authorized, no PR review required). Outcomes are bad either way: cycle 0047 fails at branch/PR steps, or worse, succeeds in opening PRs against master while the operator expects fast-forward commits.

## Scope (hotfix only — durable fix tracked separately)

This cycle restores the pre-0046 shape of `.cycle/workflows.yml`. Eliminating the divergence by making `no_branch` operator-overridable is the durable fix and is tracked as a sibling child of this same raw.

## Acceptance criteria

1. `.cycle/workflows.yml`'s `feature` workflow contains `no_branch: true` and its commit step references `scripts/commit-trunk.sh`. No `pr` step in the `feature` workflow.
2. The `LOCAL DIVERGENCE FROM src/defaults/workflows.yml` comment block (or equivalent prominent annotation) is restored at the top of `.cycle/workflows.yml`, explicitly naming `sync-defaults` as the hazard and pointing readers at the durable-fix follow-up id.
3. After running `npm run sync-defaults`, `.cycle/workflows.yml` is unchanged (i.e., this hotfix coordinates with the sibling guard work; if the guard hasn't landed yet, document the manual restore step in `BUILD.md` and surface it as a caveat in `REFLECTION.md` to keep the issue alive until the guard ships).
4. A regression test or assertion (under `tests/`) pins the trunk-based shape of `.cycle/workflows.yml`'s `feature` workflow: `no_branch === true`, commit script is `scripts/commit-trunk.sh`, no `pr` step. This test must fail if a future sync re-clobbers the file.
5. `cycle status` and a dry-run `cycle run "<text>" --dry-run` both still succeed against the restored workflow (no schema regressions).
6. Coverage thresholds from CLAUDE.md (line ≥ 95 / branch ≥ 75 / function ≥ 90) remain held — this is a config + tiny-test cycle, so deltas should be ~0.

## Out of scope

- Implementing the sync-defaults guard (sibling child).
- Introducing a runtime `no_branch` override (sibling child — the durable fix).
- Auditing past commits for other silent reverts (separate work if surfaced by reflection).

## Notes for the spec / plan steps

- The pre-0046 shape of `.cycle/workflows.yml` is reconstructable from `git show 868146f^:.cycle/workflows.yml`. Use that as the source of truth.
- The regression test should read `.cycle/workflows.yml`, not `src/defaults/workflows.yml`, since the divergence lives in the consumer-side file.
