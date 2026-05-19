# Must-Fix Items: Cycle 0112

## Summary
2 critical issues (SPEC violation + 3 unbacked doc claims), 3 minor issues (2 stale doc claims + 1 coverage gap).

## Tasks

- [x] ### Task 1: Enforce push:false for local-only mode in commitCycle()
  **Status:** ✅ Fixed
  **What was done:** Changed `src/engine/commit-cycle.ts:144` to `if (!opts.config.push || opts.config.mode === "local-only")`. Added test "local-only mode with push:true — mode wins, no push" confirming no push call for contradictory config. All 413 tests pass.

- [x] ### Task 2 (Unbacked Doc Claim): ENGINE.md:113 — cycle.base_pull emitted for all modes, not just worktree-pr
  **Status:** ✅ Fixed
  **What was done:** Replaced ENGINE.md:113 with accurate text describing that trunk/local-only emit `cycle.checkout status:skipped reason:"trunk"`, worktree-pr emits `status:ok`, and `cycle.base_pull` is emitted in all modes when checkout succeeds. Verified: `grep -n "cycle.base_pull" docs/ENGINE.md` shows updated accurate line with no worktree-pr-only claim.

- [x] ### Task 3 (Unbacked Doc Claim): ENGINE.md:46 — stale pr.sh reference
  **Status:** ✅ Fixed
  **What was done:** Removed "`pr.sh` is restart-tolerant via `gh pr list --head`." sentence from ENGINE.md:46. Verified: `grep -n "pr\.sh" docs/ENGINE.md` returns no results.

- [x] ### Task 4 (Unbacked Doc Claim): ENGINE.md:52 — stale no_branch reference
  **Status:** ✅ Fixed
  **What was done:** Replaced "Workflows with `no_branch: true` skip this entirely." with "Workflows using `trunk` or `local-only` commit mode skip this entirely (controlled by `cfg.engine.commit.mode`)." Verified: `grep -n "no_branch" docs/ENGINE.md src/engine/workflow.ts src/engine/run-cycle.ts` returns no results in any file.

- [x] ### Task 5: Add tests for uncovered stageFiles branches in commit-cycle.ts
  **Status:** ✅ Fixed
  **What was done:** Added three tests to `tests/engine/commit-cycle.test.ts`: (1) "stageFiles — renamed file" uses `git mv` to trigger the `R`/`C` arrow path (lines 62-64); (2) "stageFiles — staged deletion" uses `git rm` to trigger the `D` continue path (lines 70-71); (3) "stageFiles — gitlink exclusion" uses a fake git that injects a `160000` mode entry to verify gitlink paths are excluded. `commit-cycle.ts` line coverage is now 99.35% (was 94.84%), well above the 95% floor.
