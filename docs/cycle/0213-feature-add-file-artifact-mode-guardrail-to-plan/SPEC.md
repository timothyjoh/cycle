# Spec: Add File Artifact Mode Guardrail to plan.md Prompt

## Objective

Add a `## File Artifact Mode` section to `src/defaults/prompts/plan.md` to prevent
the plan agent from emitting conversational output into PLAN.md artifacts. Mirror the
guardrail cycle 0212 introduced in `src/defaults/prompts/spec.md`.

## Background

`src/defaults/prompts/plan.md` has no `## File Artifact Mode` guardrail. Without it,
the plan agent can emit insight blocks, confirmation sentences, and trailing commentary
that contaminate PLAN.md — breaking SPEC→PLAN traceability and producing unnecessary
NEEDS-FIX cycles. Cycle 0212 fixed the identical contamination class in `spec.md`.

## Scope

Single prompt file: `src/defaults/prompts/plan.md`. Sync to `.cycle/prompts/plan.md`
via `npm run sync-defaults`. Add pinned test assertions. No engine-level enforcement.

## Acceptance Criteria

- `src/defaults/prompts/plan.md` contains a `## File Artifact Mode` section
- Section explicitly prohibits conversational framing, insight blocks, and confirmation sentences
- `npm run sync-defaults` propagates the change; `.cycle/prompts/plan.md` matches byte-for-byte
- Test assertions in `tests/defaults/plan-prompt-spec-traceability.test.ts` verify prohibition language is present
- Full test suite passes with no regressions
- Coverage gates pass (no per-file floor violations)
