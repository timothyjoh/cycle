---
id: refl-0228-parkfordiscussion-rename-failure-catch-b
title: Add test coverage for parkForDiscussion rename-failure catch branch
workflow: feature
depends_on: []
triaged_at: "2026-05-21T15:46:04.390Z"
source: triage
---
## Problem

The catch branch in `parkForDiscussion` (`src/engine/triage.ts` lines ~702–703, 717–718) has zero test coverage per LCOV. Cycle 0228 FIX.md guarded the `issue.parked_for_discussion` emit inside the catch block but did not add a test exercising the failure path. A future refactor of the try/catch could silently re-introduce the original bug (unconditional emit on rename failure).

## What to do

Add a test in the triage test suite that:

1. Stubs `fs.promises.rename` (or the equivalent import used by `parkForDiscussion`) to throw an error.
2. Drops a raw with `priority: discuss` so `parkForDiscussion` is invoked via `runTriage`.
3. Asserts that **no** `issue.parked_for_discussion` event is emitted — use `events.filter(e => e.type === 'issue.parked_for_discussion').length === 0` (cardinality-pinned, not `.find()`).
4. Asserts the return value is **not** `{ status: 'paused', reason: 'all_triage_failed' }` — a rename failure must not be counted as a triage failure; the raw stays in place and the engine continues.

## Acceptance criteria

- LCOV shows the catch branch in `triage.ts` covered (lines 702–703 and 717–718 green).
- `npm run test:coverage && npm run check:coverage` passes with `triage.ts` at or above its 95% floor.
- Test uses cardinality-pinned assertion for the absence of `issue.parked_for_discussion`.

## Notes

- `refl-0228-parkfordiscussion-emits-no-log-event-whe` will add an `issue.park_failed` event once shipped. After that lands, extend this test to also assert `events.filter(e => e.type === 'issue.park_failed').length === 1` on rename failure.
- `refl-0228-discuss-routing-test-does-not-assert-sou` is the complement: asserts the raw file is absent after a *successful* park. Both tests together give full branch coverage of the happy and sad paths.
