## Summary

Applied Fix 1 from `FINAL_FIXES.md` — the only listed task.

**Fix 1: research prompt overstated which agents the no-op precedes.** The research prompt told the agent a valid `NOOP.md` lets the engine "resolve the cycle before spec/plan/build/review agents run," but in the `feature` workflow `spec` runs *before* `research`, so `spec` has already executed by the time the short-circuit fires. Dropped `spec/` from the phrase in `src/defaults/prompts/research.md:55` so it now reads "before plan/build/review," then re-ran `npm run sync-defaults` to propagate the edit to the synced `.cycle/prompts/research.md:55`. Both copies verified.

This is a documentation-string correction with no behavioral code path; the existing test suite already covers the no-op detection logic, which is unchanged.

**Test outcome:** `npm test` passes — 996 tests, 0 failures, 0 skipped.

No unfixed tasks.
