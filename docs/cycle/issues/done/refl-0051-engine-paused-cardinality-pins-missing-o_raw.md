---
id: refl-0051-engine-paused-cardinality-pins-missing-o
source: reflection
title: engine-paused-cardinality-pins-missing-on-sibling-triage-tests
added_at: "2026-05-14T18:35:05.132Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0051"
---

Cycle 0051 added `events.filter((e) => e.event === "engine.paused").length === 1` to one whole-pass-failure test (`tests/engine/triage.test.ts:487`) but SPEC explicitly carved the four sibling tests on the same emission site (`src/engine/triage.ts:229-244`) out of scope: multi-raw ordering (`triage.test.ts:536`), 2000-char truncation (`:578`), boundary length 2000 (`:615`), and unknown-agent surfacing (`:804`). Each still uses `events.find(...)` + `assert.ok(paused, ...)` for existence only — a regression that double-emits `engine.paused` on any of those four divergent failure-path setups would pass all four sibling tests while failing only the single canonical one.

The risk isn't hypothetical: the four siblings exercise *different* setups (multiple raws, long error strings, boundary truncation, agent-resolution failure) that could shake out emit-site bugs the single-raw path can't. Cardinality is per-test, not per-emission-site, so partial coverage is partial guarantee.

Proposed direction: either insert the same one-line `filter.length === 1` assertion into all four sibling tests (mechanical, ~20 lines), or extract `expectSinglePaused(events): EngineEvent` into the test helpers near `makeLog()` (lines 37-47) and migrate all five engine.paused positive-assertion sites to it. The helper form is cheaper to extend when new failure-path tests are added.
