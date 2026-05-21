All 647 tests pass, all coverage gates pass (Line 98.47%, Branch 92.43%, Function 92.95%). No regressions.

Implemented cycle 0218: added `appendSystemPrompt?: string` to `ExecModule.runStep` interface in `src/engine/exec.ts` (+1 line); restructured `src/engine/exec-claudecode.ts` to destructure and conditionally prepend `--append-system-prompt <text>` to argv before `-p` (+4 lines); added `ARTIFACT_STEPS` constant and `ARTIFACT_SUPPRESS_PROMPT` string to `src/engine/run-cycle.ts` and wired `appendSystemPrompt` at the `mod.runStep()` call site (+10 lines); added 2 argv-assertion tests to `tests/engine/exec-claudecode.test.ts` (+42 lines); added WRONG/CORRECT negative examples to `src/defaults/prompts/plan.md`, `review.md`, `build.md`, `research.md`, `fix.md`, `documentation.md` (~6 lines each); synced all 6 to `.cycle/prompts/`; added 3 tests to `tests/defaults/plan-prompt-spec-traceability.test.ts` (+12 lines) and 4 tests to `tests/defaults/file-artifact-mode-guardrail.test.ts` (+16 lines); fixed 3 fake-binary dispatch patterns in `tests/engine/run-cycle.documentation.test.ts` that used `$3` (now `for last; do :; done` idiom) to accommodate the shifted argv position. All PLAN.md tasks complete. Test suite: `npm test` → 647 pass / 0 fail (baseline 638 +9). Coverage: `npm run test:coverage` → Line 98.47%, Branch 92.43%, Function 92.95% — all global and per-file gates pass. `npm run typecheck` → zero errors. No deviations from PLAN.md; the `$3`→last-arg fix in documentation tests was an unplanned regression caught mid-cycle.

## Touched Files
- src/engine/exec.ts
- src/engine/exec-claudecode.ts
- src/engine/run-cycle.ts
- tests/engine/exec-claudecode.test.ts
- tests/engine/run-cycle.documentation.test.ts
- src/defaults/prompts/plan.md
- src/defaults/prompts/review.md
- src/defaults/prompts/build.md
- src/defaults/prompts/research.md
- src/defaults/prompts/fix.md
- src/defaults/prompts/documentation.md
- .cycle/prompts/plan.md
- .cycle/prompts/review.md
- .cycle/prompts/build.md
- .cycle/prompts/research.md
- .cycle/prompts/fix.md
- .cycle/prompts/documentation.md
- tests/defaults/plan-prompt-spec-traceability.test.ts
- tests/defaults/file-artifact-mode-guardrail.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0217-spec-md-negative-example-hardcodes-cycle.md
- docs/cycle/issues/todo/refl-0214-spec-md-contamination-recurs-across-thre-fix-spec-step-learning-mode-conflict.md
