---
id: refl-0212-plan-md-prompt-lacks-file-artifact-mode
source: reflection
title: plan.md prompt lacks File Artifact Mode guardrail — same contamination class as spec.md
added_at: "2026-05-21T08:15:08.100Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0212"
---

Cycle 0212 fixed `src/defaults/prompts/spec.md` by adding a `## File Artifact Mode` section that prohibits conversational framing, insight blocks, and confirmation sentences. The cycle's own `PLAN.md` was a contaminated conversational artifact on first emit (REVIEW.md finding: "PLAN.md is a conversational reply ('Plan written to…', 'Which approach?'), not a structured plan document") — demonstrating that `src/defaults/prompts/plan.md` has the identical contamination class.

`src/defaults/prompts/plan.md` has no equivalent file-artifact guardrail. The plan agent outputs `PLAN.md` as a file artifact read by downstream build and review agents. Contaminated plans break SPEC→PLAN traceability and cause NEEDS-FIX cycles (as seen here).

Fix direction: add a `## File Artifact Mode` section to `src/defaults/prompts/plan.md` mirroring the language added to spec.md in cycle 0212. Apply same sync-defaults propagation and test-assertion pattern used in this cycle.
