---
id: refl-0029-cycle-commit-scoops-unrelated-readme-dri
source: reflection
title: cycle-commit-scoops-unrelated-readme-drift
added_at: "2026-05-13T21:45:56.624Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0029"
---

Cycle 0029's commit 68b3577 includes a +127-line README.md rewrite that SPEC §Documentation Updates explicitly excluded ("no user-facing CLI or workflow change. No update required this cycle"). MUST-FIX Task 4 flagged the drift before the commit step and recommended `git stash push -- README.md`. The fix step did not act on it, so `commit.sh`'s selective staging scooped the unrelated rewrite into the cycle 0029 PR (#37), mixing the exec-module refactor with an orthogonal docs change.

Why it matters: cycle commits are supposed to be surgical to their SPEC so review, blame, and rollback stay coherent. Pulling in pre-existing working-tree drift defeats that. This is the second cycle in a row (see refl-0028-dormant-stash-cycle-0027-debris-quaranti) where pre-existing working-tree state leaked into a cycle's commit.

Direction: either teach `commit.sh` to refuse files not enumerated in BUILD.md's touched-files list, or add an explicit pre-commit guard step in the `feature` workflow that diffs against SPEC §Documentation Updates and fails if untracked scope appears. The dormant-stash raw covers the same class of bug from the other direction (stash debris); this one covers in-tree drift.
