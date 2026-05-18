PLAN.md written. Summary:

- **No prod changes** — pure test addition in `tests/engine/run-cycle.test.ts`
- Fixture: two `build` `step.start` rows for same `cycle_id` with an interleaved `step.warning`, OLD_SHA first, NEW_SHA last
- Assert `findPriorBuildHeadSha` returns `"NEW_SHA"` (bottom-up scan picks the newer row)
- `findPriorBuildHeadSha` already imported at line 7 of that file
