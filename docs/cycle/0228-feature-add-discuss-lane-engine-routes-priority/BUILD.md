All gates pass. `triage.ts` line: 99.48%, branch: 97.31%, function: 95.24% — all above the 95% floor. Overall: line 98.60%, branch 92.64%, function 93.25%.

## Summary

Implemented Cycle 0228: discuss/ lane — engine routes `priority:discuss` raws to a human-in-the-loop folder.

**Files modified:**
- `src/engine/triage.ts` (+18 lines): Added `parkForDiscussion` helper after `moveToFailed` (mirrors its mkdir+rename pattern, no frontmatter mutation); inserted `if (raw.fm.priority === "discuss")` pre-agent routing check with `continue` in `runTriage` for-loop.
- `tests/engine/triage-priority.test.ts` (+145 lines): Added `readdir` import, `makeLogCapturing()` helper, and four new test cases: discuss routing (agent never called, file parked, no side effects, event emitted), non-discuss unchanged, release round-trip, mixed batch.
- `docs/RFC-001-issue-lifecycle.md`: Added `discuss/` to folder layout block, added `### Discuss` frontmatter subsection with release mechanism, updated stale note about discuss rows auto-draining.

**Files created:**
- `docs/cycle/issues/discuss/.gitkeep`

**All PLAN.md tasks complete** (Tasks 1–4).

**Test suite:** `npm test` — 667 tests, 0 failures (was 663; +4 new tests).

**Coverage:** `npm run test:coverage` — `triage.ts` line 99.48% / branch 97.31% / function 95.24% (floor: 95% line). All per-file coverage floors pass. Overall line 98.60% / branch 92.64% / function 93.25% — no regression vs baseline.

**No deviations from PLAN.md.** No deferred work introduced by this cycle (the known `dryRunTriage` gap for discuss raws was pre-documented as out of scope in SPEC and PLAN).

## Touched Files
- src/engine/triage.ts
- tests/engine/triage-priority.test.ts
- docs/RFC-001-issue-lifecycle.md
- docs/cycle/issues/discuss/.gitkeep
- docs/ENGINE.md
