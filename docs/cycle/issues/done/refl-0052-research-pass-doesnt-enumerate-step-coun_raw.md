---
id: refl-0052-research-pass-doesnt-enumerate-step-coun
source: reflection
title: research-pass-doesnt-enumerate-step-count-parity-tests
added_at: "2026-05-14T18:58:35.865Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0052"
---

PLAN.md Task 5 enumerated five sub-steps but did not anticipate that `tests/defaults/feature-yaml.test.ts:11-12` and `tests/defaults/feature-loadable.test.ts:14-19` hard-code the 10-step `feature` workflow sequence and would fail when the 11th step landed. Builder correctly updated both and flagged the deviation in BUILD.md ("PLAN's Open-question #4 anticipated step-count parity tests but RESEARCH did not list these two"). REVIEW §Finding #2 noted this as a process gap.

This is recurring: any workflow-shape mutation (add step, remove step, rename agent, change prompt path) will hit the same blind spot. RESEARCH.md doesn't currently grep for `"steps":` count assertions, exact step-name array literals, or `.length` assertions on workflow.steps. Suggested direction: add a one-line checklist item to `src/defaults/prompts/research.md` for any cycle whose diff touches `src/defaults/workflows.yml` — "grep `tests/defaults/` and `tests/engine/` for hard-coded step counts or exact step-name arrays before declaring research complete." Alternatively, make the test assertions loop over a single source-of-truth array exported from the test-harness layer, so adding a step touches one place instead of N.
