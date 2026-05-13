---
id: refl-0028-plan-step-silently-dropped-spec-annotati
source: reflection
title: plan-step-silently-dropped-spec-annotation-site-392
added_at: "2026-05-13T21:15:14.914Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0028"
---

SPEC § Documentation Updates enumerated four RFC-001 lines requiring annotation (10, 390, 392, 416). PLAN.md Task 2 silently reduced the verification list to three (10, 390, 416), BUILD applied three, REVIEW caught the gap as MUST-FIX Task 1, FIX applied the section-level prelude. The cycle absorbed the slip, but the SPEC→PLAN traceability gate is weak: nothing in the plan-step prompt enforces 'every SPEC bullet maps to a plan task or is explicitly waived with rationale.'

Direction: tighten the plan prompt (`src/defaults/prompts/plan.md`) to require an explicit acceptance-criteria checklist that re-enumerates SPEC bullets, or add a static check in the verify step that diffs PLAN.md task IDs against SPEC.md acceptance bullets. The latter is more robust but heavier; the prompt tweak is the cheap win.
