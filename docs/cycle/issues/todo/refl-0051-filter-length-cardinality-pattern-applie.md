---
id: refl-0051-filter-length-cardinality-pattern-applie
title: Codify filter().length===1 cardinality convention in CLAUDE.md + migrate 8 engine.halted/reflection.summary offenders
workflow: feature
depends_on: [refl-0051-engine-paused-cardinality-pins-missing-o-expect-single-paused-helper]
triaged_at: "2026-05-14T18:37:47.769Z"
source: triage
---
## Problem

The `events.filter(predicate).length === 1` cardinality pattern that cycles 0022 and 0051 established for `engine.paused` is applied inconsistently across the engine-event test suite. Some sites pin emitted-exactly-once invariants with `filter(...).length === 1` (e.g. `tests/cli/resume.test.ts:349`, `tests/cli/halt.test.ts:129, 165`, `tests/engine/reflection.test.ts:240`), while sibling tests pinning the same single-emission invariants on `engine.halted` and `reflection.summary` still use `find(...) !== undefined` existence-only checks.

Known offenders (8 sites):

- `tests/cli/halt.test.ts:119` — `engine.halted` (find existence)
- `tests/cli/halt.test.ts:187` — `engine.halted` (find existence)
- `tests/engine/reflection.test.ts:77` — `reflection.summary` (find existence)
- `tests/engine/reflection.test.ts:112` — `reflection.summary` (find existence)
- `tests/engine/reflection.test.ts:159` — `reflection.summary` (find existence)
- `tests/engine/reflection.test.ts:182` — `reflection.summary` (find existence)
- `tests/engine/reflection.test.ts:257` — `reflection.summary` (find existence)
- `tests/engine/reflection.test.ts:357` — `reflection.summary` (find existence)

Without a documented convention, every new engine-event test rolls a coin between `find` (≥1) and `filter.length` (===1), and cardinality coverage stays patchwork — exactly the gap cycle 0022 surfaced for `engine.paused` and cycle 0051 closed for one test.

## Acceptance criteria

1. CLAUDE.md gains a new "Test conventions" subsection (or extends an existing one) documenting the rule: **engine events documented as 'fires exactly once' (or whose source is `log.emit` outside a loop) MUST be pinned in tests with `events.filter(predicate).length === 1`, not `events.find(predicate) !== undefined`**. Rationale linking back to cycles 0022 / 0051 included.
2. The 8 offender sites listed above are migrated to `filter(...).length === 1`. Each retained assertion still inspects the event payload it was checking before (no behavioral regression in the test).
3. Test suite green: all 343+ tests pass.
4. Coverage gates hold (no regression vs master baseline; per-file `src/engine/triage.ts ≥ 95%`).
5. If the sibling helper from `refl-0051-engine-paused-cardinality-pins-missing-o-expect-single-paused-helper` lands as a generic `expectExactlyOne(events, eventName): EngineEvent` (vs an `expectSinglePaused`-shaped one), this cycle should adopt it across the 8 migrated sites. If the sibling ships an event-specific helper, this cycle MAY introduce `expectExactlyOne` as a sibling helper instead — explicitly choose one direction in the SPEC.

## Notes

- Depends on the sibling `refl-0051-engine-paused-cardinality-pins-missing-o-expect-single-paused-helper` so the helper shape is settled before this cycle multiplies the call sites. Resolving that dep first avoids churning the same lines twice.
- Migration is mechanical but intent-preserving: each `find` site asserts existence and often immediately inspects the returned event's payload. The replacement should still bind the unique event for payload assertions (e.g. `const [evt] = events.filter(...); expect(evt.payload.x).toBe(...)`), not just count.
- Out of scope: pinning cardinality on events that legitimately may fire ≥1 time (e.g. per-loop-iteration events). The convention only applies where the spec says exactly-once.
