---
id: refl-0205-spec-md-prompt-does-not-require-a-struct
title: "Require ## Acceptance Criteria section in spec.md prompt output"
workflow: feature
depends_on: []
triaged_at: "2026-05-21T05:42:25.109Z"
source: triage
---
## Problem

The `spec.md` prompt does not require an explicit `## Acceptance Criteria` section in its output. SPEC artifacts can be thin narration with no testable acceptance bullets, forcing downstream steps (PLAN, REVIEW) to independently derive criteria rather than trace against SPEC-stated ones.

Observed in cycle 0205: SPEC.md was two lines of narration. PLAN.md had to independently derive six acceptance bullets and carry a `## SPEC Acceptance Traceability` table to compensate. The review step cannot mechanically verify SPEC claims — it can only verify what PLAN inferred.

## Root Cause

`src/defaults/prompts/spec.md` does not mandate a `## Acceptance Criteria` block as a named output section.

## Required Changes

### 1. `src/defaults/prompts/spec.md`

Add a required output section to the prompt instructions:

- `## Acceptance Criteria` must appear as a named section
- Must contain at least one testable, bulleted condition
- Bullets must be specific and verifiable (observable outcomes, not vague narration)
- Example bullet form: "Running `npm test` after the change passes with no new failures"

After editing, run `npm run sync-defaults` to propagate to `.cycle/prompts/spec.md`.

### 2. Review instructions (`src/defaults/prompts/review.md` or equivalent)

Update review step to:

- Verify each SPEC `## Acceptance Criteria` bullet one-for-one against the implementation
- Flag any SPEC bullet not addressed
- Do not accept PLAN-inferred criteria as a substitute for SPEC-stated criteria
- If SPEC lacks an `## Acceptance Criteria` section entirely, flag as a SPEC defect (not a PLAN gap)

## Acceptance Criteria

- `src/defaults/prompts/spec.md` requires a `## Acceptance Criteria` section with at least one testable bullet
- `.cycle/prompts/spec.md` matches after `npm run sync-defaults`
- Review instructions reference SPEC AC bullets directly, not PLAN inferences
- Full test suite passes after changes
