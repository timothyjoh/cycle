---
id: refl-0017-rate-limit-max-retries-halt-skips-step-e
source: reflection
title: rate-limit-max-retries-halt-skips-step-end-emission
added_at: 2026-06-01T01:32:30.291Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0017"
---

The new `rate_limit_max_retries` halt path in `runCycle` (`src/engine/run-cycle.ts:438-444`) emits `engine.halted` and `cycle.end` then returns early, but it returns *before* the `step.end` emission at `src/engine/run-cycle.ts:567`. Every other terminal path (normal step failure at :590, cycle success at :595) emits `step.end` first. As a result, a cycle that halts on rate-limit exhaustion leaves a dangling `step.start` (emitted at :349) with no matching `step.end` for that step — an asymmetry REVIEW.md did not flag.

This matters for log consumers that pair start/end events. Concretely, the iteration-too-fast guard's `readCycleEndFailure` (`src/engine/iteration-guard.ts`) reads the failed cycle's `failing_step` and the matching `step.end.duration_ms`; with no `step.end` present it returns `undefined` and silently degrades to normal retry, so the fast-fail guard can never act on a rate-limit halt. Any dashboard tallying step durations also sees an unterminated step.

Suggested direction: emit a `step.end` (status `failed`, with the accumulated `duration_ms`) immediately before the `engine.halted`/`cycle.end` block in the rate-limit-cap branch, mirroring the :567 emission, so the halt path produces the same start/end pairing as every other failure path. Add a test asserting the boundary-above scenario emits a `step.end` for the rate-limited step.
