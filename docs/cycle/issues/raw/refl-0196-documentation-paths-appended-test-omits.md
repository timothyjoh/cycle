---
id: refl-0196-documentation-paths-appended-test-omits
source: reflection
title: documentation.paths_appended test omits cycle_id payload assertion
added_at: "2026-05-20T04:16:08.568Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0196"
---

Test A (`documentation.paths_appended emitted when paths are appended`) validates `ev.appended` but never asserts `ev.cycle_id`. The SPEC defines payload shape as `{ cycle_id: string, appended: string[] }` — both fields are part of the contract. A regression that emits the wrong key (e.g. `cycleId` vs `cycle_id`) or omits the field entirely would not be caught by the test suite.

REVIEW.md Pass 2 flagged this explicitly: "One minor gap: Test A doesn't assert ev.cycle_id in the payload." It was downgraded to non-blocking because the SPEC acceptance bullet only required the appended array, but the payload shape requirement is still in SPEC §Requirements.

Fix: add `assert.equal(ev.cycle_id, "PATHS-APPENDED-1")` (or the issue ID used in that test) immediately after the `expectExactlyOne` call in `tests/engine/run-cycle.documentation.test.ts`.
