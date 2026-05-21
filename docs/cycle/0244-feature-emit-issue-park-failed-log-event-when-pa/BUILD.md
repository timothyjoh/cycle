## Summary

Modified `src/engine/triage.ts` (1 line changed: `catch {` → `catch (e) {`, plus one `await log.emit(...)` call added) and `tests/engine/triage-priority.test.ts` (added one cardinality-pinned assertion in the existing success-path test and one new 40-line failure-path test using directory-as-destination fault injection). Updated `docs/ENGINE.md` line 19 to reflect that rename failures now emit `issue.park_failed` instead of "emitting nothing". All three PLAN.md tasks are complete. Full test suite: `npm test` → 713 tests, 0 failures. Coverage: `npm run test:coverage` → all per-file gates pass (`src/engine/triage.ts` at 99.74% lines, 97.89% branches, 95.35% functions, floor 95%); overall 98.75% lines / 92.54% branches / 93.36% functions — no regressions. No deviations from PLAN.md; `mock.method` approach was correctly bypassed in favor of real-filesystem fault injection as planned. No deferred work.

## Touched Files
- src/engine/triage.ts
- tests/engine/triage-priority.test.ts
- docs/ENGINE.md
