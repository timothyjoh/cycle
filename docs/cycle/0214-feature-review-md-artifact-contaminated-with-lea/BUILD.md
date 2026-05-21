611 passing, 0 failing (608 baseline + 3 new). All coverage gates hold.

Cycle 0214 complete. Modified `src/defaults/prompts/review.md` (+19 lines: inserted `## File Artifact Mode` guardrail between `Unbacked claims are a NEEDS-FIX trigger.` and `## Output 1: REVIEW.md`). Ran `npm run sync-defaults` — `.cycle/prompts/review.md` is byte-identical. Added 3 new test assertions to `tests/defaults/review-prompt-spec-ac.test.ts` (7 total). `npm run test:coverage` ran clean: 611 passing, 0 failing; Line 98.51%, Branch 92.50%, Function 92.95% — no regression vs baseline. All per-file coverage floors pass. No deviations from PLAN.md.

## Touched Files
- src/defaults/prompts/review.md
- .cycle/prompts/review.md
- tests/defaults/review-prompt-spec-ac.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0213-review-step-checklist-missing-plan-md-ar.md
- docs/cycle/issues/todo/refl-0212-plan-md-prompt-lacks-file-artifact-mode.md
