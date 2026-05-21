RESEARCH.md written to `docs/cycle/0213-feature-add-file-artifact-mode-guardrail-to-plan/RESEARCH.md`.

Key findings:
- `src/defaults/prompts/plan.md` (136 lines) has no `## File Artifact Mode` section — that's the gap
- `src/defaults/prompts/spec.md:117-135` is the exact template to mirror
- New tests belong in `tests/defaults/plan-prompt-spec-traceability.test.ts` (already has `PLAN_SRC`/`PLAN_DOG` constants and dogfood identity test)
- `src/defaults/prompts/plan.md` and `.cycle/prompts/plan.md` are byte-identical now; `sync-defaults` must run after the edit
- Baseline: 605 pass, 0 fail
