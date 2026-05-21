Zero TypeScript errors. All quality gates satisfied.

## Summary

Added the inline `FILE ARTIFACT MODE:` directive as the very first line of all seven artifact prompt templates (`spec.md`, `plan.md`, `build.md`, `review.md`, `research.md`, `fix.md`, `documentation.md`) in `src/defaults/prompts/`, prepended before each existing `# Title` heading with one blank line separator. Added 7 corresponding directive-presence tests across the three existing test files (`spec-prompt-ac.test.ts` +1, `plan-prompt-spec-traceability.test.ts` +2, `file-artifact-mode-guardrail.test.ts` +4), following the established `assert.ok(body.includes(...))` pattern. Ran `npm run sync-defaults` which propagated all seven files to `.cycle/prompts/` (2 unrelated divergent files skipped as expected). `npm run test:coverage` ran with result: **659 tests pass, 0 fail** (652 + 7 new). Coverage: Line 98.47% ≥ 95%, Branch 92.44% ≥ 75%, Function 92.95% ≥ 90% — all gates pass, no regression. `npm run typecheck` exits 0. No deviations from PLAN.md.

## Touched Files
- src/defaults/prompts/spec.md
- src/defaults/prompts/plan.md
- src/defaults/prompts/build.md
- src/defaults/prompts/review.md
- src/defaults/prompts/research.md
- src/defaults/prompts/fix.md
- src/defaults/prompts/documentation.md
- .cycle/prompts/spec.md
- .cycle/prompts/plan.md
- .cycle/prompts/build.md
- .cycle/prompts/review.md
- .cycle/prompts/research.md
- .cycle/prompts/fix.md
- .cycle/prompts/documentation.md
- tests/defaults/spec-prompt-ac.test.ts
- tests/defaults/plan-prompt-spec-traceability.test.ts
- tests/defaults/file-artifact-mode-guardrail.test.ts
- docs/ENGINE.md
- docs/cycle/issues/raw/refl-0219-append-system-prompt-suppression-still-i.md
- docs/cycle/issues/raw/refl-0219-step-warning-emission-tested-for-codex-o.md
- docs/cycle/issues/todo/refl-0218-non-claudecode-exec-modules-silently-ign-runtime-warning.md
- tests/engine/run-cycle.append-system-prompt-warning.test.ts
