---
id: refl-0214-review-prompt-tests-missing-trailing-com
source: reflection
title: review-prompt tests missing trailing-commentary prohibition assertion
added_at: "2026-05-21T09:00:46.167Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0214"
---

The three new tests added in cycle 0214 (`tests/defaults/review-prompt-spec-ac.test.ts`) cover: the guardrail header sentence, the insight-blocks/star-marker prohibition, and the confirmation-sentences prohibition. The **third prohibition bullet** — "trailing commentary addressed to the reader" — has no corresponding test assertion.

If that text is ever accidentally removed, renamed, or reworded, no test will catch the regression. The plan explicitly named all three prohibition bullets as testable strings; one was omitted in the implementation.

Fix: add a fourth test asserting `body.includes("trailing commentary")` (or the exact phrase used in the prompt) to `tests/defaults/review-prompt-spec-ac.test.ts`.
