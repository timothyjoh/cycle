All gates pass. Line 98.54%, Branch 91.69%, Function 93.18% — no regressions.

Modified `src/defaults/prompts/documentation.md` (added 13 lines: REFLECTION.md bullet in `## Inputs to read` after line 16, plus extraction guidance paragraph in `## What to edit` before Discipline section) and ran `npm run sync-defaults` to propagate to `.cycle/prompts/documentation.md` (both now byte-for-byte identical). All three PLAN.md tasks complete. Test suite: 531/531 pass (`npm test`). Coverage: Line 98.54%, Branch 91.69%, Function 93.18% — no per-file floor regressions (`npm run test:coverage && npm run check:coverage` clean). No deviations from PLAN.md. No new TypeScript files; no test changes required (prompt template is plain text, no content tests existed). No follow-up work identified — SPEC acceptance criteria fully met.

## Touched Files
- src/defaults/prompts/documentation.md
- .cycle/prompts/documentation.md
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0190-documentation-prompt-does-not-read-refle.md
- docs/cycle/issues/todo/refl-0187-reflection-runs-after-documentation-prev-reorder-reflection-before-docs.md
