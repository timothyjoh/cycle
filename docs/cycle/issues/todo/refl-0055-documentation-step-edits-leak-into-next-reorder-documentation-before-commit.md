---
id: refl-0055-documentation-step-edits-leak-into-next-reorder-documentation-before-commit
title: Reorder `documentation` step before `commit`/`pr` so doc edits ride along with the feature commit
workflow: feature
depends_on: [refl-0052-documentation-step-edits-orphaned-no-com, refl-0044-reflection-artifacts-committed-by-next-c, refl-0029-cycle-commit-scoops-unrelated-readme-dri]
triaged_at: "2026-05-14T20:09:25.683Z"
source: triage
parent: refl-0055-documentation-step-edits-leak-into-next
---
## Problem

In both trunk-based and branch-based `feature` workflows, the `documentation` step runs **after** `commit`/`pr`. Its edits to `README.md` and `docs/**` are uncommitted at the end of the producing cycle, then get swept into the **next** cycle's `commit` step by `git add -A`.

Concrete proof: cycle 0055's commit `fe945bb` ships +5 lines to `README.md` (the dry-run failure-shape paragraph) that were written by cycle 0054's `documentation` step at 19:46:49Z — four hours before 0055's commit at 20:04:09Z. `docs/cycle/0055-feature-remove-redundant-parsedtriageoutput-type/REVIEW.md` line 50 also flags this as a side-note.

## Consequences

1. **Doc/code split across two consumer-visible commits.** The diff that introduced the behavior change and the diff that documents it land in different commits attributed to different cycles. Anyone reading the actual feature commit sees stale docs.
2. **Commit message misrepresents diff scope.** `cycle 0055: Remove redundant ParsedTriageOutput type alias` lands a README delta about dry-run failure semantics — reviewers see unrelated changes under a four-line type-rename title.

## Fix direction

Reorder `documentation` to run **before** `commit`/`pr` in both `feature` workflow variants (`src/defaults/workflows.yml` shipped default + `.cycle/workflows.yml` dogfood trunk-based). Doc edits then naturally fall into the same `git add -A` as the code change.

Reject alternatives:
- `git commit --amend --no-edit && git push --force-with-lease` after `documentation` — branch-based footgun (force-push races + PR re-review churn). Trunk-based fresh-commit variant works but ships two commits per cycle for no good reason.
- Leave order as-is and document the asymmetry — half-measure; downstream commit-scope-enforcement work (refl-0029-cycle-commit-scoops-unrelated-readme-dri) will still trip on the carryover.

## Interplay with existing queue

- `refl-0052-documentation-step-edits-orphaned-no-com` (already in `todo/`) is the parent symptom report from cycle 0052; this child is the workflow-order-fix execution of that. Land this **after** 0052 lands, or fold 0052 into this one when it's pulled.
- `refl-0044-reflection-artifacts-committed-by-next-c` is the sibling carryover bug for reflection artifacts — same root cause class (terminal step writes uncommitted bytes). Fix may share infrastructure (post-`commit`/`pr` step audit).
- `refl-0029-cycle-commit-scoops-unrelated-readme-dri` is the dual: a guard at `commit` time against unrelated working-tree drift. With this reorder fix, the `documentation` carryover case stops feeding that guard's false-positive surface.
- `refl-0052-no-branch-plus-documentation-shape-has-n` covers test coverage of `documentation` under `no_branch: true`; reorder fix means **both** workflow variants need the test parity.

## Acceptance

1. Both `src/defaults/workflows.yml` and `.cycle/workflows.yml` have `documentation` positioned before `commit` (trunk-based) / before `pr` (branch-based).
2. A cycle that edits `README.md` in `documentation` produces a single commit whose diff includes the README delta; **no carryover** into the next cycle's `git diff --cached`.
3. Regression test pins the step order in both workflow YAMLs (extend the cycle-0048 AC-4-style structural pin).
4. `run-cycle.ts` non-fatal-set still includes `documentation` (failure remains soft; it just runs earlier in the lifecycle).
5. RFC/CLAUDE.md note added: post-`commit`/`pr` steps MUST NOT mutate the working tree (only emit artifacts / surface issues to `raw/`). Cite cycle 0055 fe945bb as the canonical violation case.
