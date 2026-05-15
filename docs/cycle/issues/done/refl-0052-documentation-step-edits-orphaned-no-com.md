---
id: refl-0052-documentation-step-edits-orphaned-no-com
title: Commit documentation-step doc edits so they reach the PR (consumer) / master (dogfood)
workflow: feature
depends_on: []
triaged_at: "2026-05-14T19:00:56.091Z"
source: triage
superseded_by: refl-0055-documentation-step-edits-leak-into-next-reorder-documentation-before-commit
superseded_at: "2026-05-15T21:39:52.993Z"
---
The `documentation` workflow step (added in cycle 0052) edits drifted docs in place under `README.md` / `docs/**/*.md`, but no subsequent step commits or pushes those edits — so the step's PRIMARY side effect is unreachable for the workflow shapes it targets.

## Failure modes

**Consumer `feature` workflow (`src/defaults/workflows.yml`).** Step order is `... → commit → pr → reflection → documentation`. `pr` opens the PR BEFORE `documentation` runs, so any `Edit` to `README.md` / `docs/**/*.md` sits uncommitted on the cycle branch. `runCycle`'s post-loop `checkoutBase` (`src/engine/run-cycle.ts:165-180`) then either fails on dirty-tracked-file changes or silently abandons them — either way the edits never reach the open PR.

**Dogfood trunk-based workflow (`.cycle/workflows.yml`, `no_branch: true`).** Step order is `... → commit-trunk.sh → reflection → documentation`. `commit-trunk.sh` already ran before `documentation`, so edits remain uncommitted on master until a future cycle's `commit-trunk.sh` sweeps them up (or `sync-defaults --force` clobbers them).

Only the `DOCUMENTATION.md` artifact (under `docs/cycle/<id>/`) survives, because `pr` had already snapshot the artifact directory via the generic stdout-capture path. REVIEW.md §Finding #1 in cycle 0052 flagged this gap explicitly — the build matched SPEC verbatim, but the SPEC design itself was incomplete.

## Acceptance criteria

- A `documentation`-step edit to `README.md` (or any tracked file under `docs/**` outside `docs/cycle/*`) reaches the target branch on the same cycle: the open PR (consumer `feature`) or master (dogfood trunk-based).
- Regression test: synthetic cycle that triggers a doc edit during the `documentation` step ends with that edit visible on the target branch / PR head — not stranded on the cycle branch and not silently dropped.
- `documentation.skipped {reason: "exec_failed"}` semantics preserved: a failed documentation step still does NOT flip `cycle.end` to failed (the code change has already merged via `pr` / `commit-trunk.sh`).
- Both workflow shapes covered (branch-based + `no_branch: true`).

## Design options (decide during plan)

- **(a) Prompt commits its own edits.** Extend `src/defaults/prompts/documentation.md` to require `git add` + `git commit -m "docs: <summary>"` + `git push` at the end. Uniform across both workflow shapes. Couples the agent to git semantics.
- **(b) Add `commit-docs` step after `documentation`.** Dedicated bash script (analogous to `commit-trunk.sh`) that commits/pushes any working-tree edits under `README.md` / `docs/**/*.md` (excluding `docs/cycle/*`). Cleanest separation of concerns; keeps git semantics out of the agent prompt. Adds a third post-PR step.
- **(c) Move `documentation` BEFORE `pr` in the consumer workflow.** Smallest diff for the consumer side. Requires re-ordering and accepting that `documentation` now blocks the PR; the "code already merged upstream" rationale for the non-fatal `documentation.skipped` path weakens. Does NOT fix the dogfood trunk-based shape (no `pr` step there).

Favor (b) — it handles both shapes uniformly and keeps the agent prompt focused on doc edits. Confirm during plan.

## References

- Reflection origin: `docs/cycle/0052-feature-add-documentation-workflow-step-prompt-p/REFLECTION.md`
- Cycle 0052 REVIEW.md §Finding #1: gap flagged explicitly.
- Sibling problem: `refl-0044-reflection-artifacts-committed-by-next-c` (reflection artifacts swept by next cycle's `commit`). Same neighborhood — post-cycle artifacts not reaching the right destination.
- Code touchpoints: `src/engine/run-cycle.ts:165-180` (`checkoutBase`), `src/defaults/prompts/documentation.md`, `src/defaults/workflows.yml` (consumer step order), `.cycle/workflows.yml` (trunk-based step order), `src/defaults/scripts/commit-trunk.sh` (reference pattern for option b).
