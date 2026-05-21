All 594 tests pass (593 existing + 2 new), 0 failures. Coverage gates all green. `reflection.ts` at 100% line, 98.65% branch, 100% function.

Modified 2 files: `src/engine/reflection.ts` (+8 lines changed) and `tests/engine/reflection.test.ts` (+44 lines added).

Modified files were changed as follows:
- `src/engine/reflection.ts` (lines 132–186): `trimToLastBalancedClose` gains `startOffset: number = 0` param and returns `{ slice: string; start: number } | null`; `parseWithRepair` replaced single repair attempt with `while(true)` retry loop advancing `offset = repaired.start + 1` on each failed parse attempt.
- `tests/engine/reflection.test.ts` (appended 2 tests): Test A verifies prose `{build}` brace before JSON object recovers via retry with no parse-error file; Test B verifies prose `{with: braces}` before JSON array → parse succeeds, shape check fails cleanly with no parse-error file.

Test command: `npm run test:coverage` — 594 tests, 0 failures.
Coverage: line 98.46%, branch 92.41%, function 92.95% (project-wide); `reflection.ts` 100% line / 98.65% branch / 100% function; all per-file floors pass.
No deviations from PLAN.md. No deferred work.

## Touched Files
- src/engine/reflection.ts
- tests/engine/reflection.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0208-triage-validateoutput-has-no-trimtolastb.md
- docs/cycle/issues/raw/refl-0208-trimtolastbalancedclose-still-fails-for.md
- docs/cycle/issues/todo/refl-0206-reflection-parse-path-uses-incidental-tr.md
