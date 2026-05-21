---
id: refl-0205-spec-md-prompt-does-not-require-a-struct
source: reflection
title: spec.md prompt does not require a structured Acceptance Criteria section, producing thin SPEC artifacts
added_at: "2026-05-21T05:39:04.747Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0205"
---

SPEC.md for cycle 0205 was two lines of narration with no `## Acceptance Criteria` block. The review noted that PLAN.md had to independently derive six acceptance bullets and carry a `## SPEC Acceptance Traceability` table because SPEC provided nothing to trace against. This means the review step cannot mechanically verify SPEC claims — it can only verify what PLAN inferred.

The root cause is in `src/defaults/prompts/spec.md`: the prompt likely does not require an explicit acceptance-criteria section. Adding a mandatory `## Acceptance Criteria` section (bulleted, testable conditions) to the spec output contract would give downstream steps (plan, review) a stable anchor for traceability checks.

Suggested direction: update `spec.md` to require `## Acceptance Criteria` as a named output section with at least one testable bullet, and update `REVIEW.md` instructions to verify bullets one-for-one against SPEC rather than against PLAN inferences.
