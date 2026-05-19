No TS errors. All gates pass.

Created `tests/defaults/local-workflows-divergence.test.ts` (20 lines, within 25-line budget) with one `test()` block asserting four trunk-based invariants against `.cycle/workflows.yml`: `feature` workflow exists, `no_branch` is absent, no `commit` step, no `pr` step, and `engine.commit.mode === "worktree-pr"`. Each assertion has a named failure message. PLAN.md Task 1 is complete. Test suite: 475 tests, 0 failures (previously 474). Coverage gate: all 6 per-file floors pass (triage.ts 99.46%, issue-lifecycle.ts 100%, commit-cycle.ts 99.53%, branch.ts 99.22%, stale-dist.ts 100%, run-one.ts 73.96%). Typecheck: no warnings. SPEC ACs 3 and 4 were restated per PLAN.md — the current invariants are absence of `no_branch` and absence of commit/pr steps (post-cycle-0130 engine-managed shape), not `no_branch: true` or `commit-trunk.sh` references. No documentation updates required per SPEC. No deviations from PLAN.md. No deferred work.

## Touched Files
- tests/defaults/local-workflows-divergence.test.ts
