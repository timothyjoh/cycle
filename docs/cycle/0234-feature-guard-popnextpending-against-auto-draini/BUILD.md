All coverage gates pass. `src/engine/queue.ts` branch coverage is 97.72% (floor ≥ 90%). Overall: Line 98.70%, Branch 92.50%, Function 93.44% — all above baseline floors.

Modified `src/engine/queue.ts` (added 2-line comment + `&& r.priority !== "discuss"` predicate), `tests/engine/queue.test.ts` (renamed existing test + added 11-line all-discuss stall test), and `docs/ENGINE.md` (extended discuss note at line 48). Tasks 1–3 complete per PLAN.md. Full test suite: `npm test` → 697 pass, 0 fail. Coverage: `npm run test:coverage` → `src/engine/queue.ts` 97.72% branch (floor 90%); all per-file gates pass; no regressions vs baseline. No deviations from PLAN.md. No follow-up work required.

## Touched Files
- src/engine/queue.ts
- tests/engine/queue.test.ts
- docs/ENGINE.md
