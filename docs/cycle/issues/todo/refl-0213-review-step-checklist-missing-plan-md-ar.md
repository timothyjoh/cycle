---
id: refl-0213-review-step-checklist-missing-plan-md-ar
title: Add PLAN.md artifact cleanliness check to review prompt Pass 1 checklist
workflow: feature
depends_on: []
triaged_at: "2026-05-21T08:44:24.886Z"
source: triage
---
## Problem

Cycle 0213's PLAN.md contained `★ Insight ─────...` star-marker commentary blocks (lines 2–5) injected by the plan agent. The review step did not flag this — REVIEW.md's NEEDS-FIX verdict covered only SPEC.md contamination; PLAN.md cleanliness went unchecked.

The review prompt's Pass 1 checklist currently enforces two hard NEEDS-FIX conditions for PLAN.md:
1. Missing `## SPEC Acceptance Traceability` section
2. Sourcing ACs from PLAN.md when SPEC.md is contaminated

It does not check whether PLAN.md itself is free of insight blocks, star-marker commentary, or confirmation sentences. This means a future plan step that ignores the File Artifact Mode guardrail (added in cycle 0213) will silently produce a contaminated PLAN.md that passes review.

## Goal

Add a PLAN.md artifact cleanliness check to the review prompt's Pass 1 checklist. Flag any of the following as a hard NEEDS-FIX:

- `★ Insight` blocks or any star-marker commentary lines
- Confirmation or narration sentences (e.g. "I've completed...", "Great, the plan is...")
- Learning-mode meta-commentary about the implementation process

This mirrors the SPEC.md `## Acceptance Criteria` enforcement standard: a structural violation in the artifact is a hard NEEDS-FIX regardless of whether the implementation is otherwise correct.

## Acceptance Criteria

- [ ] `src/defaults/prompts/review.md` Pass 1 checklist includes a PLAN.md cleanliness check covering insight blocks, star-marker commentary, and confirmation/narration sentences
- [ ] The check is explicitly labeled as a hard NEEDS-FIX condition (same weight as missing `## SPEC Acceptance Traceability`)
- [ ] Test in `tests/defaults/` asserts the prohibition strings are present in the review prompt (e.g. `★ Insight`, `star-marker`, `confirmation sentences`)
- [ ] `npm run sync-defaults` run — `.cycle/prompts/review.md` byte-identical to `src/defaults/prompts/review.md`
- [ ] All existing tests pass; `npm run test:coverage` + `npm run check:coverage` green; no coverage regressions
