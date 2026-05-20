All gates pass. Line 98.57%, Branch 91.82%, Function 93.27% — all above floors.

---

Modified `src/engine/run-cycle.ts` (3 changes: import, function signature, emit call, call site — net +2 lines), added 2 tests to `tests/engine/run-cycle.documentation.test.ts` (+54 lines), added one sentence to `docs/ENGINE.md`. All 3 PLAN.md tasks complete. Ran `npm run test:coverage` on Node 22.22.2: 558 pass, 0 fail; line 98.57%, branch 91.82%, function 93.27% — all gates pass, no regressions. No deviations from PLAN.md; `Logger` type needed adding to the import (was only `createLogger` before) — minor mechanical gap not mentioned in plan, handled inline. No deferred work.

## Touched Files
- src/engine/run-cycle.ts
- tests/engine/run-cycle.documentation.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0195-pi-model-and-thinking-flag-names-assumed.md
- docs/cycle/issues/raw/refl-0195-run-cycle-forwarding-test-acs-don-t-yet.md
