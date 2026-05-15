---
id: refl-0070-resume-entry-skip-gate-test-still-tautol
source: reflection
title: resume-entry-skip-gate-test-still-tautological-after-fix
added_at: "2026-05-15T20:46:56.718Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0070"
---

REVIEW.md Adversarial finding 3 flagged the `"skip gate self-suppresses on resume entry"` test as exercising an impossible production state: `cycleId:"0001"`, `attempt:1`, `resume:{startStepIndex:0}`, pre-seeded artifacts. A real resume entry at `startStepIndex:0` with `attempt:1` means a same-cycleId crash before any step ran, so by construction there is nothing to skip. FIX.md does not address this finding (it's not on the MUST-FIX list — only the three doc-claim/cycle_id items were). The test stays as a coverage placeholder that asserts the predicate's mechanics but corresponds to no real recovery scenario.

The risk is twofold: (a) the test gives false confidence that the resume + skip interaction is covered; (b) when a future change inevitably alters resume semantics, this test will either pass vacuously or fail in a way that's hard to interpret because the scenario isn't realistic.

Suggested direction: either delete the test outright (the predicate is already covered by the `!isResumeEntry` branch in the attempt=1-with-artifacts test) or replace it with a scenario that matches a real resume: same cycle_id, prior `cycle.start` + partial `step.end` events in `log.jsonl`, resume math points past the completed pre-build steps, assert no `step.skipped` events fire because `startStepIndex` already covers them.
