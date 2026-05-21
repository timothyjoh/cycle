603 passing, 0 failing (8 more than previous 595, from the new tests). All coverage gates met.

Implemented all 4 tasks from PLAN.md. Modifed `src/defaults/prompts/spec.md` (+10 lines, `## Required Sections` prose block inserted between fenced output template and `## Cycle Sizing`), modified `src/defaults/prompts/review.md` (+6 lines for `**SPEC AC coverage**` bullet, +1 line extension to NEEDS-FIX triggers). Ran `npm run sync-defaults` — both `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to their `src/defaults/` counterparts. Created `tests/defaults/spec-prompt-ac.test.ts` (36 lines, 4 tests) and `tests/defaults/review-prompt-spec-ac.test.ts` (36 lines, 4 tests). Ran `npm run test:coverage`: 603 passed, 0 failed. Overall line 98.51% / branch 92.50% / function 92.95% — all per-file floors met, no regressions. Existing `/NEEDS-FIX triggers:[\s\S]*traceability/` regex preserved — "traceability" remains after the new AC clause. No deviations from PLAN.md.

## Touched Files
- src/defaults/prompts/spec.md
- src/defaults/prompts/review.md
- .cycle/prompts/spec.md
- .cycle/prompts/review.md
- tests/defaults/spec-prompt-ac.test.ts
- tests/defaults/review-prompt-spec-ac.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0209-engine-md-known-limitation-1-outdated-af.md
- docs/cycle/issues/raw/refl-0209-refl-0208-trimtolastbalancedclose-todo-f.md
- docs/cycle/issues/raw/refl-0209-spec-md-artifacts-contain-learning-mode.md
- docs/cycle/issues/todo/refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip.md
- docs/cycle/issues/todo/refl-0208-triage-validateoutput-has-no-trimtolastb.md
- docs/cycle/issues/todo/refl-0208-trimtolastbalancedclose-still-fails-for.md
- tests/engine/triage-validator.test.ts
