---
id: refl-0051-filter-length-cardinality-pattern-applie
source: reflection
title: filter-length-cardinality-pattern-applied-inconsistently-across-engine-event-tests
added_at: "2026-05-14T18:35:05.132Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0051"
---

The `filter(...).length === 1` cardinality pattern that cycle 0051 establishes for `engine.paused` is already used ad-hoc in some engine-event tests (`tests/cli/resume.test.ts:349`, `tests/cli/halt.test.ts:129, 165`, `tests/engine/reflection.test.ts:240`) but missing from others that pin the same single-emission invariants on the same events: `engine.halted` at `tests/cli/halt.test.ts:119, 187` and `reflection.summary` at `tests/engine/reflection.test.ts:77, 112, 159, 182, 257, 357` — all still use `find(...) !== undefined` existence-only checks.

Without a documented convention, every new engine-event test will roll a coin between `find` (≥1) and `filter.length` (===1), and cardinality coverage will stay patchwork — which is exactly the gap cycle 0022 surfaced for `engine.paused` and cycle 0051 closed for one test.

Proposed direction: codify the rule in CLAUDE.md under a new "Test conventions" subsection — "engine events documented as 'fires exactly once' (or whose source is `log.emit` outside a loop) MUST be pinned in tests with `events.filter(...).length === 1`, not `events.find(...) !== undefined`" — and ship a one-shot migration in the same cycle to bring the eight known offenders onto the pattern. Optionally introduce `expectExactlyOne(events, eventName): EngineEvent` as a shared helper.
