All 672 tests pass, all coverage gates hold (line 98.60%, branch 92.67%, function 93.28%; `run-cycle.ts` at 100.00% ≥ 90%), all structural invariants verified.

Added `final_fix` to `RESET_ELIGIBLE_STEPS` and `ARTIFACT_STEPS` in `src/engine/run-cycle.ts` (Tasks 1), inserted `final_fix` and `final_verify` steps between `reflection` and `documentation` in `src/defaults/workflows.yml` (Task 2), created `src/defaults/prompts/final_fix.md` (Task 3), added the soft self-check line to `build.md` and `fix.md` (Task 4), ran `npm run sync-defaults` to propagate all four changes to `.cycle/` (Task 5; byte-identical confirmed), wrote four tests in `tests/engine/run-cycle.final-fix.test.ts` covering skip path, run path, footprint append, and resume dedup (Task 6), and updated `docs/ENGINE.md` with the feature workflow step sequence section, touched.json coverage of `final_fix`, and the updated `ARTIFACT_STEPS` member count (Task 7). Three existing step-count pinning tests were updated (`tests/dogfood/feature-yaml.test.ts`, `tests/defaults/feature-yaml.test.ts`, `tests/defaults/feature-loadable.test.ts`) as they would have failed given the workflow now has 11 steps instead of 9. No PLAN.md deviations. No deferred work beyond what SPEC already defers to redesign-07 (reflection producing `FINAL_FIXES.md`).

## Touched Files
- src/engine/run-cycle.ts
- src/defaults/workflows.yml
- src/defaults/prompts/final_fix.md
- src/defaults/prompts/build.md
- src/defaults/prompts/fix.md
- .cycle/workflows.yml
- .cycle/prompts/final_fix.md
- .cycle/prompts/build.md
- .cycle/prompts/fix.md
- tests/engine/run-cycle.final-fix.test.ts
- tests/dogfood/feature-yaml.test.ts
- tests/defaults/feature-yaml.test.ts
- tests/defaults/feature-loadable.test.ts
- docs/ENGINE.md
