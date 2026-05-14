---
id: refl-0059-multi-failed-partial-fail-deferred-flush
source: reflection
title: multi-failed-partial-fail-deferred-flush-loop-untested-with-n-greater-than-1
added_at: "2026-05-14T21:34:29.214Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0059"
---

REVIEW.md §Test Coverage explicitly flags this: the deferred-flush loop body in `src/engine/triage.ts` is exercised at N=1 (single failed raw) by `stampfail` and the existing partial-fail test, but no test runs the loop with N≥2 entries in `failedRaws`. Loop body is the same regardless of N, so the actual risk is low — but a regression that, e.g., breaks index-alignment between `failed[]`, `lastErrors[]`, and `failedRaws[]` only on the second iteration would slip through.

Direction: add one focused test in `tests/engine/triage.test.ts` with three raws (one decomposes cleanly, two fail every attempt). Assert: `failed/` contains exactly the two failed ids each with `failed_step: "triage"` + `failed_at` stamped, the success raw's children are queued in order, no `engine.paused` event emitted (it's partial-fail, not all-fail), and the queue rows for the two failures are absent from `tbd.jsonl`. Cheap to write, tightens the regression net for any future refactor of the deferred-list pattern.
