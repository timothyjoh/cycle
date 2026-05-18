---
id: refl-0059-multi-failed-partial-fail-deferred-flush
title: Cover deferred-flush loop body in triage with N≥2 failed raws (partial-fail path)
workflow: feature
depends_on: []
triaged_at: "2026-05-14T21:39:01.991Z"
source: triage
---
## Context

Cycle 0059 introduced a deferred-list pattern in `src/engine/triage.ts`: failed raws are accumulated, then on the partial-fail path (some raws succeed, some fail) they are flushed in a loop that calls `moveToFailed` for each entry. The all-fail path (`failed.length === raws.length`) skips the flush entirely so raws stay in `raw/` for `cycle triage --dry-run` re-evaluation.

REVIEW.md §Test Coverage from cycle 0059 explicitly flagged that the deferred-flush loop body is exercised at N=1 only — by `stampfail` and the existing partial-fail test. No test runs the loop with N≥2 entries in `failedRaws`. The loop body is identical regardless of N, so observed risk is low, but a regression that breaks index-alignment between `failed[]`, `lastErrors[]`, and `failedRaws[]` (e.g. an off-by-one introduced by a future refactor) would only surface on the second iteration and slip past the existing tests.

## What to do

Add one focused test in `tests/engine/triage.test.ts` that drives the partial-fail deferred-flush loop with N=2 failed raws plus one successful raw. Three raws total:

- 1 raw that triages cleanly and decomposes into ordered children
- 2 raws that fail every triage attempt (exhaust the 3-attempt retry budget)

## Acceptance

- New test in `tests/engine/triage.test.ts` runs the triage subroutine with three raws as described.
- Assert: `docs/cycle/issues/failed/` contains exactly the two failed raw ids, each renamed to `<id>.md` (no `_raw` suffix — that suffix is for the all-success done path).
- Assert: each failed file has frontmatter with `failed_step: "triage"` and a `failed_at` ISO-8601 timestamp.
- Assert: the successful raw's children appear in `docs/cycle/issues/todo/` in declared order, with corresponding `tbd.jsonl` rows appended in the same order.
- Assert: NO `engine.paused` event is emitted on `.cycle/log.jsonl` (this is the partial-fail path, not all-fail).
- Assert: the two failed raw ids do NOT appear as rows in `tbd.jsonl` (they were never queued; they moved straight to `failed/`).
- Assert: the successful raw moved from `raw/` to `done/<id>_raw.md` (the standard decomposed-parent done path).
- Existing N=1 partial-fail test remains green (no regression).
- `npm run test:coverage` still passes the per-file gate `src/engine/triage.ts ≥ 95%` line coverage.

## Why

The deferred-list pattern isolates all-fail vs partial-fail control flow but introduces three parallel arrays (`failed[]`, `lastErrors[]`, `failedRaws[]`) that must stay index-aligned across the loop. N=1 coverage cannot catch an off-by-one or skip-on-second-iteration bug. One N=2 test closes that gap cheaply and pins the loop body's iteration semantics for any future refactor.
