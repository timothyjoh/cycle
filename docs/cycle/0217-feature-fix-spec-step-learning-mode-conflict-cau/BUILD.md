Clean. All quality gates pass.

Modified `src/engine/sanitize-artifact.ts` (1 line changed: extended `NARRATION_LINE` regex to add `[A-Za-z0-9_.]+\.md written to` and `Single deliverable:` alternations), `src/defaults/prompts/spec.md` (5 lines changed: replaced `confirmation sentences` bullet with concrete negative example including the exact observed contamination string), `.cycle/prompts/spec.md` (synced byte-identical via `npm run sync-defaults`), `tests/engine/sanitize-artifact.test.ts` (+22 lines: 3 new unit tests for both new patterns and combined sequence), `tests/defaults/spec-prompt-ac.test.ts` (+14 lines: 2 new assertions for `confirmation sentences` phrase and `SPEC.md written to` negative example), `docs/ENGINE.md` (line 86 updated to reflect extended regex; new known-limitation paragraph added before the NVM limitation noting cycle 0217 sanitizer extension). All tasks complete: Task 1 (regex extension), Task 2 (spec.md negative example), Task 3 (sync-defaults), Task 4 (3 sanitize tests), Task 5 (2 spec-prompt-ac tests), Task 6 (ENGINE.md update), Task 7 (full suite verification). `npm test` ran: 637 tests, 0 failures (up from 632; +5 new). `npm run test:coverage`: Line 98.51%, Branch 92.50%, Function 92.95% — all global floors met; `sanitize-artifact.ts` at 100%/100%/100%. `npm run typecheck`: exit 0. No deviations from PLAN.md.

## Touched Files
- src/engine/sanitize-artifact.ts
- src/defaults/prompts/spec.md
- .cycle/prompts/spec.md
- tests/engine/sanitize-artifact.test.ts
- tests/defaults/spec-prompt-ac.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0216-review-md-artifact-contaminated-despite.md
- docs/cycle/issues/raw/refl-0216-scripts-verify-sh-nvm-path-injection-pre.md
- docs/cycle/issues/todo/refl-0214-file-artifact-mode-guardrail-absent-from.md
