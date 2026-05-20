---
id: refl-0196-documentation-paths-appended-test-omits
title: documentation.paths_appended test omits cycle_id payload assertion
workflow: feature
depends_on: []
triaged_at: "2026-05-20T04:18:38.263Z"
source: triage
failed_at: "2026-05-20T04:29:11.656Z"
failed_step: build
failed_attempts: 3
last_cycle_id: "0197"
---
## Problem

Test A (`documentation.paths_appended emitted when paths are appended`) in `tests/engine/run-cycle.documentation.test.ts` asserts `ev.appended` but never asserts `ev.cycle_id`. The SPEC defines the payload shape as `{ cycle_id: string, appended: string[] }` — both fields are part of the contract.

A regression that emits the wrong key (e.g. `cycleId` vs `cycle_id`) or omits the field entirely would not be caught by the test suite.

REVIEW.md Pass 2 flagged this gap explicitly: "One minor gap: Test A doesn't assert ev.cycle_id in the payload." It was downgraded to non-blocking because the SPEC acceptance bullet only required the `appended` array, but the full payload shape requirement is still in SPEC §Requirements.

## Fix

In `tests/engine/run-cycle.documentation.test.ts`, immediately after the `expectExactlyOne` call in Test A, add:

```ts
assert.equal(ev.cycle_id, "PATHS-APPENDED-1");
```

Substitute `"PATHS-APPENDED-1"` with whatever issue ID is used as `cycleId` in that test fixture.

## Acceptance criteria

- [ ] `ev.cycle_id` assertion added to Test A immediately after `expectExactlyOne` call in `tests/engine/run-cycle.documentation.test.ts`
- [ ] The asserted value matches the issue ID used in that test fixture
- [ ] `npm test` passes with the new assertion in place
- [ ] Coverage gates still met (`npm run test:coverage`)
