---
id: refl-0228-parkfordiscussion-rename-failure-catch-b
source: reflection
title: parkForDiscussion rename-failure catch branch has no test coverage
added_at: "2026-05-21T15:40:29.625Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0228"
---

The catch branch (`renamed = false`) in `parkForDiscussion` has zero test coverage per the REVIEW test coverage section (`triage.ts:702–703, 717–718` in LCOV). The FIX.md fixed the code behavior (guarding the emit) but did not add a test that exercises the failure path. To cover it: inject a mock `rename` that throws, call `runTriage`, and assert no `issue.parked_for_discussion` event is emitted and the return status is not `paused`. Without a test, a future refactor of the try/catch could silently re-introduce the original bug (unconditional emit on failure).
