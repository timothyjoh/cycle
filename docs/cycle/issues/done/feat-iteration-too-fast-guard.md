---
id: feat-iteration-too-fast-guard
title: "Guard against runaway too-fast retry loops (fail-fast on instant repeated failures)"
workflow: feature
depends_on: []
triaged_at: "2026-05-31T01:50:00.000Z"
source: user
priority: medium
---
## Problem

When a step fails almost instantly and is retried, the engine can spin through
its attempt budget in milliseconds without any real work happening — a runaway
tight loop. The current retry machinery bounds *count* (`max_cycle_attempts`)
but not *rate*: N near-instant failures burn the budget pointlessly and produce
noisy logs, and under some conditions (e.g. a misconfigured binary that exits 1
immediately) the engine churns instead of failing fast with a clear signal.

(Borrowed from a5c-ai/babysitter's `iteration_too_fast` stop-hook guard, which
allows exit when iterations complete suspiciously fast.)

## Task

Add a too-fast guard to the retry path in `src/engine/run-cycle.ts` (and/or the
supervisor retry in `src/cli.ts`):

- Track per-step attempt wall-clock duration.
- If a step fails in under a configurable threshold
  (`engine.min_step_duration_ms`, default e.g. 2000ms) for `K` consecutive
  attempts (default 2), stop retrying that step and fail the cycle immediately
  with `engine.halted`/`cycle.end { reason: "iteration_too_fast" }` rather than
  exhausting the attempt budget.
- Emit a `step.warning { reason: "iteration_too_fast", duration_ms }` before
  bailing so the operator sees why.

This is complementary to `refl-0256-...-max-retries-cap` (which bounds the
*rate-limit* loop): this bounds *instant-failure* loops.

## Acceptance criteria

- [ ] `engine.min_step_duration_ms` config (default documented) wired via `workflows.yml`/`engine.json`; synced.
- [ ] K consecutive sub-threshold failures → fail fast with `iteration_too_fast`, not full attempt-budget churn.
- [ ] `step.warning { reason: "iteration_too_fast" }` emitted.
- [ ] Tests cover: instant repeated failure → fast bail; a slow legitimate failure → normal retry; success → unaffected.
- [ ] `npm run typecheck` clean; `npm test` passes; coverage holds.

## Notes

- Source: babysitter gap-analysis (2026-05-30/31).
