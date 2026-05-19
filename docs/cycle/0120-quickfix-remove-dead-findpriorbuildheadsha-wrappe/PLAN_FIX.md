Need write permission to create PLAN.md. The plan is ready — please approve the write to `docs/cycle/0120-quickfix-remove-dead-findpriorbuildheadsha-wrappe/PLAN.md`.

**Summary of what the fix agent needs to do:**

**Fix (3 hunks):**
1. `src/engine/run-cycle.ts:82-83` — delete `export const findPriorBuildHeadSha = ...` (2 lines)
2. `tests/engine/run-cycle.test.ts:7` — drop `findPriorBuildHeadSha` from named import
3. `tests/engine/run-cycle.test.ts:665-723` — rewrite 4 wrapper tests to call `findPriorStepHeadSha(root, "0042", "build")` directly, rename titles to `findPriorStepHeadSha('build'): ...`

**Test:** Same 4 cases, same assertions — null/missing/SHA/null — now targeting `findPriorStepHeadSha` with explicit `"build"` arg.

**Verify:** `grep -r findPriorBuildHeadSha src/ tests/` → zero hits; all `npm` gates green.
