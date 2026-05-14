---
id: refl-0052-no-branch-plus-documentation-shape-has-n
source: reflection
title: no-branch-plus-documentation-shape-has-no-test
added_at: "2026-05-14T18:58:35.865Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0052"
---

All new tests in `tests/engine/run-cycle.documentation.test.ts` instantiate pr-based workflows (branch-creating, `no_branch` absent / false). The dogfood `.cycle/workflows.yml` runs `feature` with `no_branch: true` and `commit-trunk.sh` — exactly the shape this very cycle dogfooded. REVIEW §Adversarial Finding #5 flagged this as optional/non-blocking.

Not a regression risk today because `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` structurally excludes `documentation` regardless of `no_branch`, but the SPEC's two-workflow story (consumer = pr-based, dogfood = trunk-based) is now tested on only one of those two paths. The orphan-doc-edits sharp edge (above) plays out differently in each shape — fix attempts there should be regression-guarded against both.

Suggested direction: add a third test in `run-cycle.documentation.test.ts` that runs `documentation` inside a `no_branch: true` workflow with `commit` already complete, asserts the same happy-path + non-fatal-failure outcomes, and additionally asserts that no `head_sha` field appears on `step.start` for `documentation` (matching the restart-policy invariant CLAUDE.md just got updated to claim).
