---
id: refl-0071-missing-spec-plan-traceability-verify-gr
source: reflection
title: missing-spec-plan-traceability-verify-grep-false-positives-on-fenced-examples
added_at: "2026-05-15T21:18:28.796Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0071"
---

The MUST-FIX `Missing SPEC→PLAN Traceability` task shape in `src/defaults/prompts/review.md` tells the reviewer to verify the fix via `grep -c "^## SPEC Acceptance Traceability$" PLAN.md` returning `1`. In cycle 0071's own PLAN.md this grep returns `2` because the literal header text also appears inside the Task 1 fenced-code example at `PLAN.md:57` (the example showing the agent what to emit). `FIX.md` acknowledges the deviation and accepts it as substantive-intent-met; future fix cycles will trip the same anchor whenever PLAN.md or REVIEW.md *describes* the section in a fenced example.

The verify check is doing the right thing semantically — count the live section headers, not header text inside code examples — but the grep regex cannot distinguish the two. Either (a) tighten the verify command to count only out-of-fence occurrences (e.g., an awk pass that toggles on/off across ```` ``` ```` lines), (b) change the anchor to a more distinctive token that won't appear in didactic prose (e.g., an HTML comment marker the plan template emits right before the section), or (c) relax the verify success criterion to `≥ 1` with a manual confirmation step. Option (a) is the most disciplined and fixes the class of bug.

Until fixed, future MUST-FIX traceability fixes will each emit a `FIX.md` paragraph re-explaining the same false-positive, which is exactly the kind of friction the verify check was meant to eliminate.
