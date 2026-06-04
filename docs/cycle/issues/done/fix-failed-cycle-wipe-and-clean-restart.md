---
id: fix-failed-cycle-wipe-and-clean-restart
title: "Engine: on cycle failure, wipe the cycle's documents + reset the worktree and restart CLEAN — max 3 attempts, then halt"
source: text
priority: high
triage_attempts: 0
---

When a cycle fails the engine constantly halts on a dirty worktree and requires a human to `git stash`/`reset`. This defeats unattended ("AFK") operation. Replace that behavior: **a failed cycle wipes its own work and restarts from scratch, up to 3 attempts, then halts the engine completely.**

## Root cause
In **trunk mode** there is **no failed-cycle teardown**:
- `src/engine/run-cycle.ts:967-970` — the `finally` block explicitly **skips** the worktree checkout/cleanup for any non-`worktree-pr` mode (`cycle.checkout {status:"skipped", reason:"trunk"}`), so the failed cycle's edits + new untracked files stay on the base branch.
- `src/engine/commit-cycle.ts` only runs on the **success** path — a failed cycle is never committed and never reverted.
- The supervisor's residue guard (`src/cli.ts`, `failed_cycle_dirty_worktree`) then correctly detects the dirty tree and **halts**. The guard is doing its job; the missing teardown is the bug.

(In `worktree-pr` mode the failed work is isolated in a throwaway worktree, so this never bites there. The fix is specifically the trunk path, but should be mode-agnostic.)

## Desired behavior
On a **terminal step failure** within a cycle attempt:
1. **Wipe the cycle's documents.** Delete this attempt's artifact set (`docs/cycle/<cycle-id>-<slug>/` — `RESEARCH.md`, `SPEC.md`, `PLAN.md`, `BUILD.md`, `REVIEW.md`, `*.out`, `touched.json`, etc.) so the restart begins with a clean slate — **NOT** a `--skip-completed-on-retry` resume. (Skip-completed reuse is the wrong model here: the user wants a fresh start each attempt.)
2. **Reset the worktree** to the pre-cycle base state: revert tracked modifications and remove untracked files the cycle created — but **only non-engine-owned paths**. Reuse `isEngineOwned`/`isDenied` (the same predicates the residue guard uses) so `.cycle/**` runtime state (`.env`, `log.jsonl`, `tbd.jsonl`, `engine.lock`, `run.log`), the queue, and issue-lifecycle dirs are **never** touched. Prefer scoping the reset to the cycle's own footprint (`touched.json` + the porcelain diff) rather than a blind `git reset --hard`.
3. **Restart the cycle clean** — re-run from the first step on the now-clean tree.
4. **Cap at 3 attempts** (`max_cycle_attempts` = 3). If all 3 attempts fail, **halt the engine completely** — `engine.halted` + the terminal `engine.stop` + non-zero exit. Preserve the **last** failed attempt's artifacts (do not wipe attempt 3 on the way out) so a human can diagnose why it failed.

## Notes
- This makes the residue guard a rare last-resort safety net (e.g. teardown itself fails) rather than the constant halt path. Keep the guard as a fallback: if the post-failure teardown cannot clean the tree, fall back to the existing `failed_cycle_dirty_worktree` halt rather than proceeding on a dirty tree.
- Emit a clear event per restart (e.g. `cycle.restart { cycle_id, attempt, reason }`) and on the final halt (`engine.halted { reason: "max_cycle_attempts_exhausted", cycle_id, attempts }`) — never a silent wipe.
- Decide the interaction with `max_consecutive_failures`: the intent is **3 tries on the cycle → halt**. If that should still drain the issue to `failed/` and continue to the next issue instead of a full stop, make it a config (`engine.halt_on_attempts_exhausted`, default true per this directive). Confirm the intended scope (full engine halt vs drain-and-continue) — the directive says "completely halts itself," so default to full halt.
- `skip_completed_on_retry` should not apply to the failed-restart path (wiping the docs makes it a no-op anyway, but be explicit so the two mechanisms don't fight).

## Acceptance
- A cycle whose step fails leaves the worktree **clean** afterward (no residue, verified by `git status --porcelain` excluding engine-owned paths) and restarts from step 1 with freshly-regenerated documents.
- Engine-owned state (`.cycle/**`, queue, log, issue dirs) is never reset/deleted by the teardown.
- A cycle that fails 3 times halts the engine (`engine.halted` + `engine.stop` + non-zero exit), with attempt-3 artifacts retained.
- A cycle that succeeds on attempt 2 or 3 completes and commits normally.
- If teardown can't clean the tree, the engine falls back to the existing residue halt (never proceeds on a dirty tree).
- Tests cover: failure→wipe→clean-restart→success; 3×failure→halt; engine-owned paths preserved across teardown; teardown-failure→fallback-halt. Coverage per the floors (`run-cycle.ts` 90%, plus the supervisor paths).
