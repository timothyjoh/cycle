---
id: refl-0067-feature-workflow-fix-step-ignores-skip-u-honor-skip-unless-followup
title: "Cycle 0067 follow-up: verify skip_unless enforcement closes clean-review fix-step invocation"
workflow: feature
depends_on: [refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless]
triaged_at: "2026-05-15T19:20:09.493Z"
source: triage
parent: refl-0067-feature-workflow-fix-step-ignores-skip-u
---
## Context

Cycle 0067's `FIX.md` self-documents the same defect already queued as `refl-0041-engine-ignores-skip-unless-fix-step-runs-honor-skip-unless`: the `feature` workflow's `fix` step carries a `skip_unless: MUST-FIX.md` clause (in prompt text or YAML), `REVIEW.md` ended with PASS, no `MUST-FIX.md` was written, and yet `.cycle/log.jsonl` still records `step.start cycle_id:0067 step:fix agent:claudecode` followed by ~27 s of agent runtime that produced a no-op `FIX.md`.

This follow-up is **second corroborating evidence** for refl-0041, not an independent fix. Cycle 0067 was the first reflection-surfaced confirmation that the defect reproduces on a clean review (refl-0041 surfaced from cycle 0041).

## Scope

Because refl-0041 owns the implementation work (honoring `skip_unless` in `src/engine/run-cycle.ts`), this child exists to:

1. **Carry the cycle-0067 evidence** forward into the same work item so the implementer of refl-0041 has both data points when writing the regression test.
2. **Validate the fix** after refl-0041 lands: re-run a clean-review cycle (e.g. by re-triggering the same `feature` workflow with no MUST-FIX path) and confirm `.cycle/log.jsonl` shows `step.skipped step:fix reason:"skip_unless: MUST-FIX.md"` (or equivalent) instead of `step.start step:fix`.
3. **Close once refl-0041 ships**: if refl-0041's acceptance criteria already include a regression test pinning the clean-review skip behavior (see also `refl-0060-skip-unless-field-declared-but-not-enfor-regression-test` and `refl-0054-fix-step-emits-skip-narration-to-fix-md-pin-no-fix-md-when-skipped` which depend on refl-0041), this child can be closed as `duplicate_of: refl-0041` without further code work.

## Acceptance

- After refl-0041 lands, a clean-review feature cycle produces no `step.start cycle_id:<id> step:fix` event in `.cycle/log.jsonl`.
- No `FIX.md` artifact is written for the cycle (matches the `pin-no-fix-md-when-skipped` child of refl-0054).
- Cycle 0067's `FIX.md` self-documenting paragraph is the canonical evidence in the refl-0041 SPEC.
- This issue can be closed as resolved-by-refl-0041 once those two log/artifact conditions are observed in a post-refl-0041 cycle.

## Notes

The raw also raises a secondary question: is the `skip_unless` clause declared in `src/defaults/workflows.yml` / `.cycle/workflows.yml`, or only mentioned in `BUILD.md` / `FIX.md` prompts? refl-0041's investigation must answer this — if the field is only in prompts and never wired through `workflow.ts`, the fix is to either (a) parse the field in `workflow.ts` and check it in `run-cycle.ts`, or (b) delete the misleading prompt comment. This child does not pre-decide; refl-0041 owns that call.
