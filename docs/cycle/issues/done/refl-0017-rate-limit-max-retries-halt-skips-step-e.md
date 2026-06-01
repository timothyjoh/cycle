---
id: refl-0017-rate-limit-max-retries-halt-skips-step-e
title: Emit step.end on rate-limit-max-retries halt path in runCycle
workflow: feature
depends_on: []
triaged_at: 2026-06-01T01:36:44.761Z
source: triage
priority: medium
---
The `rate_limit_max_retries` halt path in `runCycle` (`src/engine/run-cycle.ts`, around lines 438-444) emits `engine.halted` and `cycle.end` then returns early — but it returns *before* the `step.end` emission (around `src/engine/run-cycle.ts:567`). Every other terminal path emits `step.end` first: normal step failure (~:590) and cycle success (~:595). As a result, a cycle that halts on rate-limit exhaustion leaves a dangling `step.start` (emitted ~:349) with no matching `step.end` for that step — a start/end asymmetry unique to this halt branch.

## Why it matters

Log consumers that pair `step.start`/`step.end` events break on this path:

- The iteration-too-fast guard's `readCycleEndFailure` (`src/engine/iteration-guard.ts`) reads the failed cycle's `failing_step` and the matching `step.end.duration_ms`. With no `step.end` present it returns `undefined` and silently degrades to normal retry, so the fast-fail guard can never act on a rate-limit halt.
- Any dashboard tallying step durations sees an unterminated step.

## Suggested direction

Emit a `step.end` (status `failed`, carrying the accumulated `duration_ms`) immediately before the `engine.halted`/`cycle.end` block in the rate-limit-cap branch, mirroring the existing `:567` emission, so this halt path produces the same `step.start`/`step.end` pairing as every other failure path. Keep the early return flowing through the existing `finally` checkout/base-pull cleanup.

## Acceptance

- The `rate_limit_max_retries` halt branch emits exactly one `step.end` (status `failed`, with a `duration_ms`) for the rate-limited step before `engine.halted`/`cycle.end`.
- Event ordering on this path matches the other terminal paths: `step.end` precedes `engine.halted` precedes `cycle.end`.
- Add a test asserting the increment-then-compare boundary-above scenario (the `cap + 1`-th rate-limited attempt) emits a `step.end` for the rate-limited step, pinned exactly-once via `filter(...).length === 1` / `expectExactlyOne`.
- Coverage on `src/engine/run-cycle.ts` stays at/above its 90% floor; no regression to the existing rate-limit retry/halt tests.
