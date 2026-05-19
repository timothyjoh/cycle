All three tasks fixed, tests pass, MUST-FIX.md updated. Here's the summary:

---

All 3 MUST-FIX tasks addressed. 429/429 tests pass. Coverage vs BUILD.md baseline: line 99.16% (↑ from 99.05%), branch 92.04% (↑ from 91.91%), function 97.22% (unchanged). All per-file floors pass (`commit-cycle.ts` 99.53% ≥ 95%).

**Task 1** — Corrected `docs/ENGINE.md` line 101: "keyed by `cycle/<workflow>/<slug>`" → "at `docs/cycle/<cycleId>-<workflow>-<slug>`" to match actual `branch.ts:59` path format.

**Task 2** — Applied Option A: corrected `docs/ENGINE.md` line 105 to remove the unbacked "No automatic push;" claim for `worktree-pr` mode. Replaced with "Push behavior follows `config.push` (same as `trunk`)" which matches the actual guard condition in `commit-cycle.ts`.

**Task 3** — Added one test covering the rename/copy arrow-extraction branch (`R  old.ts -> README-renamed.md` → asserts `["README-renamed.md"]` blocked). Branch coverage for `commit-cycle.ts` increased from 85.29% to 85.88%.
