# Must-Fix Items: Cycle 0213

## Summary
1 critical issue: SPEC.md is a contaminated 2-line narrative artifact with no `## Acceptance Criteria` section.

## Tasks

- [x] ### Task 1: Rewrite SPEC.md as a proper structured spec
  **Priority:** Critical
  **Files:** `docs/cycle/0213-feature-add-file-artifact-mode-guardrail-to-plan/SPEC.md`
  **Problem:** SPEC.md contains only two lines of narrative prose ("SPEC.md written to… Single deliverable: …"). It has no `## Objective`, no `## Background`, and no `## Acceptance Criteria` section. A missing AC section is a NEEDS-FIX trigger per review policy and prevents valid SPEC→PLAN traceability.
  **Fix:** Replace the file contents with a proper structured spec. The canonical source for the acceptance criteria is the upstream issue file `docs/cycle/issues/todo/refl-0212-plan-md-prompt-lacks-file-artifact-mode.md`. Write the spec as:

  ```markdown
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
  ```

  **Verify:** `grep -c "^## Acceptance Criteria$" docs/cycle/0213-feature-add-file-artifact-mode-guardrail-to-plan/SPEC.md` returns `1`; file contains at least the six bullets listed above.
  **Status:** ✅ Fixed
  **What was done:** Replaced the 2-line narrative with a proper structured spec containing `## Objective`, `## Background`, `## Scope`, and `## Acceptance Criteria` sections (6 bullets). Verification: `grep -c` returns `1`. Full test suite: 608 passing, 0 failing. Coverage: Line 98.51%, Branch 92.50%, Function 92.95% — all gates pass.
