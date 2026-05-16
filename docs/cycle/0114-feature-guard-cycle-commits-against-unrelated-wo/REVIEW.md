**NEEDS-FIX. 3 issues written to MUST-FIX.md.**

Summary of findings:

**Pass 1 (Code):** Clean. All 428 tests pass. Coverage 99.05% line / 91.91% branch. `commit-cycle.ts` at 98.12% ≥ 95% floor. Implementation matches SPEC exactly — `parseTouchedFiles`, `scopeGuard`, `CommitResult` extension, wire-up all correct.

**Pass 2 (Tests):** Adequate. Unit + integration + real-git regression all present. One dark branch: `scopeGuard` rename/copy handling (lines 72–74) never exercised. Minor.

**Pass 3 (Doc-vs-code):** 2 unbacked claims in `docs/ENGINE.md`:
1. **Task 1 (Critical):** `mode: trunk` description says artifact dir is keyed by `cycle/<workflow>/<slug>` — that's the *branch* name format. Actual artifact dir is `docs/cycle/<cycleId>-<workflow>-<slug>` (`branch.ts:59`).
2. **Task 2 (Critical):** `mode: worktree-pr` claims "No automatic push" — but `commitCycle()` at line 202 only suppresses push for `local-only`. No code prevents push for `worktree-pr`. Fix is either correct the doc (preferred, since `worktree-pr` is not in active use) or add the guard to `commitCycle()`.
