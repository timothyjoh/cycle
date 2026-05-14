---
id: refl-0022-engine-paused-exactly-once-assertion-mis
title: Pin engine.paused emitted-exactly-once cardinality in triage whole-pass-failure test
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:21:15.088Z"
source: triage
---
## Problem

Cycle 0022 added structured payload assertions for `engine.paused`, but the whole-pass-failure tests in `tests/engine/triage.test.ts` locate the event via `events.find(e => e.event === "engine.paused")`. `find()` returns only the first match, so a future regression that emits `engine.paused` twice (e.g. an early-exit branch added inside the per-raw retry loop, or emission accidentally moved into the loop body) would still pass the existing payload-shape assertions. SPEC §Functional mandates the event MUST emit "exactly once per pass"; the test suite does not currently lock that cardinality.

Code structure today (single emission site after the loop, immediately followed by `return`) makes double-emission unreachable, but the property is load-bearing and worth pinning at the test layer so refactors can't silently regress it.

## Scope

- File: `tests/engine/triage.test.ts`
- Locate the existing whole-pass-failure test (the one that asserts `engine.paused` payload shape with `reason: "all_triage_failed"`, `raw_ids`, `last_errors`).
- Add a single assertion alongside the existing event lookup:
  ```ts
  assert.equal(events.filter(e => e.event === "engine.paused").length, 1);
  ```
- No new fixtures, no new test cases, no production-code changes.

## Acceptance

- New assertion sits in the existing whole-pass-failure test in `tests/engine/triage.test.ts`.
- `npm test` green; `npm run typecheck` clean.
- Coverage non-regressing (assertion adds zero new branches in `src/`).
- A hypothetical future change that emits `engine.paused` twice in one pass would now fail this test.

## Out of scope

- Refactoring the emission site or hoisting it behind a helper.
- Pinning cardinality of other engine events (`engine.halted`, `engine.stop`, `reflection.summary`) — file separately if desired.
- Property-style tests across multiple failure paths.

## Reference

Surfaced by cycle 0022 reflection step (REVIEW.md Adversarial Test Review, Finding 1). Priority hint 3.
