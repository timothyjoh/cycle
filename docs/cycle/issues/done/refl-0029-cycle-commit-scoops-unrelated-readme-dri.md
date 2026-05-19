---
id: refl-0029-cycle-commit-scoops-unrelated-readme-dri
title: Guard cycle commits against unrelated working-tree drift (commit scope enforcement)
workflow: feature
depends_on: []
triaged_at: "2026-05-13T21:46:40.694Z"
source: triage
---
## Problem

Cycle 0029's commit `68b3577` included a +127-line `README.md` rewrite that SPEC §Documentation Updates explicitly excluded ("no user-facing CLI or workflow change. No update required this cycle"). MUST-FIX Task 4 of the review step flagged the drift before the commit step and recommended `git stash push -- README.md`. The fix step did not act on the recommendation, so `commit.sh`'s selective staging scooped the unrelated rewrite into PR #37, mixing the exec-module refactor with an orthogonal docs change.

This is the second cycle in a row where pre-existing working-tree state leaked into a cycle's commit (see `refl-0028-dormant-stash-cycle-0027-debris-quaranti` for the same class of bug from the stash side).

## Why it matters

Cycle commits are supposed to be surgical to their SPEC so review, blame, and rollback stay coherent. Pulling in pre-existing working-tree drift defeats that property: PR reviewers can't tell which hunks are cycle work, blame attribution drifts, and rollback can't isolate the cycle's changes.

## Direction (decide during plan step)

Two plausible designs, listed cheapest first:

1. **Teach `commit.sh` to refuse files not enumerated in BUILD.md's touched-files list.** Parse BUILD.md for the touched-files section, diff against `git status --porcelain`, and fail loudly if anything outside the enumerated set is staged or unstaged-but-tracked-modified. Cheap, but couples `commit.sh` to BUILD.md format.
2. **Add an explicit pre-commit guard step to the `feature` workflow.** New step (e.g. `scope-guard`) runs before `commit`, diffs the working tree against SPEC §Documentation Updates / BUILD.md touched-files, fails the cycle on untracked scope rather than silently passing dirty state through. More plumbing, but keeps `commit.sh` dumb and the policy lives in workflow config.

Either way the SPEC-vs-actual-diff comparison logic is the substantive part. The fix step in cycle 0029 *had* the MUST-FIX recommendation in `FIX.md` and ignored it — so any solution should be enforced by the workflow, not advisory.

## Out of scope

- Dormant-stash quarantine (covered by `refl-0028-dormant-stash-cycle-0027-debris-quaranti`).
- Re-running cycle 0029 to strip the README rewrite from PR #37 — that's a separate cleanup.

## Acceptance

- A working-tree file not enumerated as cycle-touched in BUILD.md cannot reach the commit. Mechanism is enforced (workflow step or `commit.sh` precondition), not advisory.
- Regression test demonstrates: given a cycle whose BUILD.md touches `src/foo.ts` and a working tree that also has unrelated changes to `README.md`, the cycle fails the new guard with a clear error pointing at `README.md`.
- Decision recorded in the cycle's SPEC.md whether the guard lives in `commit.sh` or as a separate workflow step, and why.
