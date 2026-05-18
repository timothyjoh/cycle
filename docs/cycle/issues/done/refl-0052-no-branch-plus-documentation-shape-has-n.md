---
id: refl-0052-no-branch-plus-documentation-shape-has-n
title: "Cover `documentation` step under `no_branch: true` workflow shape (dogfood path)"
workflow: feature
depends_on: []
triaged_at: "2026-05-14T19:01:40.740Z"
source: triage
---
## Context

All new tests in `tests/engine/run-cycle.documentation.test.ts` instantiate pr-based workflows (branch-creating, `no_branch` absent / false). The dogfood `.cycle/workflows.yml` runs `feature` with `no_branch: true` and `commit-trunk.sh` — exactly the shape this very cycle (0052) dogfooded. REVIEW §Adversarial Finding #5 flagged this as optional/non-blocking.

Not a regression risk today because `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` structurally excludes `documentation` regardless of `no_branch`, but the SPEC's two-workflow story (consumer = pr-based, dogfood = trunk-based) is now tested on only one of those two paths. The orphan-doc-edits sharp edge ([[refl-0052-documentation-step-edits-orphaned-no-com]]) plays out differently in each shape — fix attempts there should be regression-guarded against both.

## Acceptance

- Add a third test case to `tests/engine/run-cycle.documentation.test.ts` that:
  - Runs `documentation` inside a `no_branch: true` workflow with `commit` already complete (no `pr` step in the workflow).
  - Asserts the same happy-path outcome as the existing pr-based test (artifact captured to `<artifactDir>/DOCUMENTATION.md`, `step.end status:ok` emitted, `cycle.end status:ok`).
  - Asserts the same non-fatal-failure outcome (exec failure emits `documentation.skipped {cycle_id, reason: "exec_failed", exit_code}` and `cycle.end` is NOT flipped to `failed`).
  - Additionally asserts that no `head_sha` field appears on `step.start` for `documentation` — matching the restart-policy invariant CLAUDE.md claims (`head_sha` is captured only for `build` and `fix`, and `no_branch: true` workflows skip the entire capture path).
- All existing tests in the file continue to pass.
- Coverage in `src/engine/run-cycle.ts` does not regress.

## Notes

- Reference the dogfood `.cycle/workflows.yml` for the canonical trunk-based feature shape (no `pr` step, `commit-trunk.sh` replaces `commit.sh`, `no_branch: true`).
- The `head_sha`-absent assertion is the load-bearing one: it pins the structural invariant that `RESET_ELIGIBLE_STEPS` excludes `documentation`, so a future widening of that set (or accidental inclusion of `documentation` in the capture path) would trip this test.
