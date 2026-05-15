---
id: refl-0051-engine-paused-cardinality-pins-missing-o-expect-single-paused-helper
title: Extend engine.paused emitted-exactly-once cardinality pin to four sibling whole-pass-failure tests
workflow: feature
depends_on: []
triaged_at: "2026-05-14T18:36:25.724Z"
source: triage
parent: refl-0051-engine-paused-cardinality-pins-missing-o
superseded_by: refl-0051-filter-length-cardinality-pattern-applie
superseded_at: "2026-05-15T21:39:52.993Z"
---
## Problem

Cycle 0051 pinned `events.filter((e) => e.event === "engine.paused").length === 1` on a single whole-pass-failure test (`tests/engine/triage.test.ts:487`). SPEC explicitly carved the four sibling tests on the same `engine.paused` emission site (`src/engine/triage.ts:229-244`) out of scope:

1. multi-raw ordering — `tests/engine/triage.test.ts:536`
2. 2000-char truncation — `tests/engine/triage.test.ts:578`
3. boundary length 2000 — `tests/engine/triage.test.ts:615`
4. unknown-agent surfacing — `tests/engine/triage.test.ts:804`

Each sibling still uses `events.find(...)` + `assert.ok(paused, ...)` — existence-only. A regression that double-emits `engine.paused` on any of those four divergent failure-path setups (multiple raws, long error strings, boundary truncation, agent-resolution failure) passes all four sibling tests while failing only the single canonical one. Cardinality is per-test, not per-emission-site, so partial coverage is partial guarantee.

## Approach

Extract a single helper in the test file's shared block (near `makeLog()` around lines 37-47):

```ts
function expectSinglePaused(events: EngineEvent[], assertMsg = "engine.paused emitted exactly once"): EngineEvent {
  const paused = events.filter((e) => e.event === "engine.paused");
  assert.strictEqual(paused.length, 1, assertMsg);
  return paused[0]!;
}
```

Migrate all FIVE `engine.paused` positive-assertion sites in `tests/engine/triage.test.ts` (the canonical one from 0051 + four siblings) to call `expectSinglePaused(events)` instead of `events.find(...)` + `assert.ok(paused, ...)`. Downstream assertions on `paused.reason`, `paused.raw_ids`, `paused.last_errors`, `paused.error` (truncation tests) continue to work against the returned event.

Helper form > inline duplication: every new failure-path test added against the same emission site picks up cardinality enforcement for free.

## Acceptance

1. New `expectSinglePaused(events)` helper exists in `tests/engine/triage.test.ts` near `makeLog()`.
2. All five `engine.paused` positive-assertion sites use the helper:
   - canonical whole-pass-failure test (line 487, already cardinality-pinned — refactored to use helper)
   - multi-raw ordering test (line 536)
   - 2000-char truncation test (line 578)
   - boundary length 2000 test (line 615)
   - unknown-agent surfacing test (line 804)
3. Existing downstream assertions (`paused.reason`, `paused.raw_ids`, `paused.last_errors[i].raw_id`, `paused.error`) continue passing unchanged against the helper's returned event.
4. Mutation test: temporarily insert a second `log({ event: "engine.paused", ... })` call inside the SUT's whole-pass-failure block — ALL FIVE migrated tests fail (not just the canonical one). Revert before commit; this is a manual verification step, not a check-in.
5. `npm test` is green; `npm run test:coverage` shows no regression on triage.ts per-file floor (≥ 95% line).

## Out of scope

- Other `engine.paused` emission sites not covered by these five tests (none exist today; new ones added later should adopt the helper).
- `cycle.end status:failed` / other event-cardinality patterns — separate concern, separate raw if surfaced.
