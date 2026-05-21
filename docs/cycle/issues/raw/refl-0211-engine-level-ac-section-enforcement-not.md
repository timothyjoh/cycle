---
id: refl-0211-engine-level-ac-section-enforcement-not
source: reflection
title: Engine-level AC section enforcement not yet implemented — prompt-only guard is insufficient
added_at: "2026-05-21T07:45:44.222Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0211"
---

Cycle 0211 added prose to spec.md instructing the spec agent to include `## Acceptance Criteria`. This is prompt-level guidance only; cycle 0211 SPEC explicitly deferred engine-level enforcement as a follow-on cycle. Without a post-condition check, a spec agent that ignores the instruction produces an AC-free SPEC.md and the engine accepts it — reproducing the original failure mode (refl-0205).

Fix direction: add a spec-step post-condition in the engine that reads the generated SPEC.md and fails with a descriptive error if `## Acceptance Criteria` is absent or contains no checkbox-format bullets. This is analogous to the existing build step post-condition that checks for src/ changes.
