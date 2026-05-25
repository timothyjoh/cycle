---
id: refl-0221-review-md-contamination-excluded-from-mu-must-fix-triage-review-detection
title: Extend MUST-FIX triage logic to detect and include contaminated REVIEW.md artifacts
workflow: feature
depends_on: []
triaged_at: "2026-05-21T11:56:19.217Z"
source: triage
parent: refl-0221-review-md-contamination-excluded-from-mu
---
## Context

The MUST-FIX detection logic currently identifies contaminated `SPEC.md` and `RESEARCH.md` artifacts and includes them as fixable items when generating `MUST-FIX.md` after a cycle review. Cycle 0221 demonstrated that `REVIEW.md` is equally susceptible to learning-mode contamination, but the detection logic does not cover it — causing the contaminated artifact to be permanently excluded from fix scope.

## Problem

When `REVIEW.md` is contaminated, no automatic fix task is generated, leaving a silent record defect. The same contamination heuristics applied to SPEC.md and RESEARCH.md should apply to REVIEW.md.

## Acceptance Criteria

- The MUST-FIX triage logic inspects `REVIEW.md` for contamination using the same heuristics applied to `SPEC.md` and `RESEARCH.md` (learning-mode narration preamble, star-bar insight blocks, excessive prose before first heading)
- A contaminated `REVIEW.md` causes a `fix-review-artifact` task to appear in the generated `MUST-FIX.md`
- Existing contamination detection for `SPEC.md` and `RESEARCH.md` is not regressed
- Tests cover the new `REVIEW.md` contamination detection path with at least one positive (contaminated) and one negative (clean) fixture
