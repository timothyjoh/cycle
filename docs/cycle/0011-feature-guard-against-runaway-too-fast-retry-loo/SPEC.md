# SPEC — Cycle 0011: Iteration-Too-Fast Guard for Instant-Failure Retry Loops

## Objective
When a step fails almost instantly (e.g. a misconfigured agent binary that exits 1 in milliseconds), the engine currently burns its entire `max_cycle_attempts` budget in a tight, near-zero-duration loop — producing noisy logs and delaying the terminal signal an operator needs. This cycle adds a rate-based guard on top of the existing count-based budget: after `K` consecutive sub-threshold failures of the same step, the supervisor stops retrying that cycle and fails it fast, emitting a clear `iteration_too_fast` warning so the operator immediately sees *why* the cycle stopped instead of digging through identical instant-failure entries.

## Source Issue
`feat-iteration-too-fast-guard` — "Guard against runaway too-fast retry loops (fail-fast on instant repeated failures)"

## Scope

### In Scope
- Add `engine.min_step_duration_ms` config (default `2000`) to the `EngineConfig` type, the shipped `src/defaults/workflows.yml` engine block, and `npm run sync-defaults` output; the consecutive-attempt threshold `K` is a named constant (default `2`).
- In `src/engine/run-cycle.ts`, measure each step's wall-clock duration and include `duration_ms` (integer milliseconds) in the `step.end` event payload for every step (agent and bash).
- In the supervisor retry path of `src/cli.ts` (the exec-failure branch that calls `drainRetry`), track consecutive sub-threshold failures of the same `(cycle_id, failing_step)` in memory; when the count reaches `K`, emit `step.warning { cycle_id, step, reason: "iteration_too_fast", duration_ms, threshold_ms }` and route the cycle to `terminalDrain` immediately instead of consuming the remaining attempt budget.

### Out of Scope
- Any change to the rate-limit retry loop in `run-cycle.ts` — that is bounded separately by `refl-0256-...-max-retries-cap`.
- A new dedicated `engine.halted { reason: "iteration_too_fast" }` halt-reason union member. The fast-bailed cycle is routed through the existing `terminalDrain` path and counts toward `max_consecutive_failures` like any other terminal failure; extending the halt-reason taxonomy is deferred.
- Applying the guard to the commit-failure retry branch or the resume retry path (`runResumeOnce`). Commit failures are not instant-churn loops; only the primary exec-failure retry branch is in scope.
- Per-step configurable thresholds (per-workflow or per-step `min_step_duration_ms` overrides).

## Requirements
- `engine.min_step_duration_ms` is read from config with a default of `2000` ms when absent; a value of `0` disables the guard entirely (no fast-bail ever fires).
- The consecutive-fast-failure counter is scoped to a single retrying cycle and resets to zero on: a successful cycle, a terminal drain, a failure whose `duration_ms` is at or above the threshold, or a failure of a *different* step than the one being tracked.
- Step duration is measured around the step execution (including any in-process rate-limit backoff is acceptable, but the measurement must reflect real wall-clock and be a non-negative integer); it is emitted as `duration_ms` on `step.end`.
- The fast-bail terminates the cycle through the existing `terminalDrain` flow so the issue moves to `docs/cycle/issues/failed/` and the engine-level `consecutive_failures` accounting is unchanged.
- **Failure behavior**: If `min_step_duration_ms` is absent, `0`, negative, or non-numeric, the guard treats it as disabled (or default for absent) and never blocks normal retry — a malformed value must not crash the supervisor. If a failing step's `duration_ms` cannot be determined from the log tail (missing field), the guard treats that attempt as *not* sub-threshold (counter does not advance), so an unreadable signal degrades to normal count-based retry rather than a spurious fast-bail. All decisions that suppress retries surface via the `step.warning { reason: "iteration_too_fast" }` event — the guard never silently terminates a cycle.

## Acceptance Criteria
- [ ] `engine.min_step_duration_ms` exists in `EngineConfig` (`src/engine/workflow.ts`), is present in `src/defaults/workflows.yml` with value `2000`, and `npm run sync-defaults` leaves `.cycle/workflows.yml` byte-identical to the synced default (no diff).
- [ ] Every `step.end` event emitted by `runCycle` includes an integer `duration_ms ≥ 0` field.
- [ ] Given `K` (default 2) consecutive failures of the same step each with `duration_ms < min_step_duration_ms`, the supervisor emits exactly one `step.warning { reason: "iteration_too_fast", duration_ms }` for that cycle and performs `terminalDrain` without issuing a further `drainRetry` — verified by asserting no additional `cycle.start`/retry for that issue after the bail.
- [ ] A step that fails with `duration_ms ≥ min_step_duration_ms` is retried normally up to `max_cycle_attempts`, and no `iteration_too_fast` warning is emitted (slow legitimate failure unaffected).
- [ ] Failure-path criterion: when `engine.min_step_duration_ms` is `0` (or absent/malformed), the guard is disabled — repeated instant failures still consume the full attempt budget and no `iteration_too_fast` warning is emitted; the supervisor does not throw.
- [ ] A cycle that succeeds is unaffected: no `iteration_too_fast` warning, and the consecutive-fast-failure counter is reset.
- [ ] All existing tests still pass (`npm test`).
- [ ] `npm run typecheck` is clean and no compiler/linter warnings are introduced; coverage holds at or above the configured floors (`src/engine/run-cycle.ts` ≥ 90%).

## Testing Strategy
- **Framework**: existing `node:test` suite run via `npm test` / `npm run test:coverage`; use real filesystem temp dirs and the established log-tail helpers per repo test conventions.
- **Key scenarios**:
  - *Happy path*: a normal multi-step cycle still emits `step.end` with `duration_ms` and completes without any `iteration_too_fast` warning.
  - *Fast-fail bail*: drive `K` consecutive instant failures of one step (inject a fast-failing step result and a small `min_step_duration_ms`); assert exactly one `iteration_too_fast` `step.warning` (cardinality-pinned with `filter(...).length === 1`) and that the issue terminal-drains without a further retry.
  - *Slow legitimate failure*: a step that fails after a duration ≥ threshold retries normally and emits no warning.
  - *Counter reset*: a sub-threshold failure followed by an above-threshold failure (or a different failing step) does not accumulate toward `K`.
  - *Guard disabled*: `min_step_duration_ms: 0` and malformed/absent values leave retry behavior identical to today.
- Duration measurement is made deterministic by injecting the clock/duration source (extend the existing `RunCycleOpts` injection seam rather than calling `Date.now()` directly in tests).
- No UI changes — no E2E/Playwright tests required.

## Documentation Updates
- **CLAUDE.md**: add `engine.min_step_duration_ms` to the "Workflow defaults" list with its default (`2000`) and the `K` consecutive-attempt semantics; note the `iteration_too_fast` `step.warning` signal alongside the existing rate-limit/backoff entries.
- **docs/ENGINE.md**: document the iteration-too-fast guard under the retry/failure section — measurement point, supervisor counter scope and reset rules, the `step.warning` contract, and that it routes through `terminalDrain` (not a new halt reason).
- **README.md**: no user-facing surface change beyond the new config key; if README documents engine config keys, add `min_step_duration_ms` there.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing supervisor retry machinery in `src/cli.ts` (`drainRetry`, `terminalDrain`, in-memory `consecutiveFailures` counters, `readCycleEndFailingStep` / log-tail readers) — the new counter lives in the same single long-running supervisor process so it persists across an issue's retries.
- Existing `runCycle` step-execution loop and `step.end` emission in `src/engine/run-cycle.ts`.
- Config load/sync path: `src/engine/workflow.ts` (`EngineConfig`), `src/defaults/workflows.yml`, and `scripts/sync-defaults.mjs` (`npm run sync-defaults`).
- No new external services or environment variables.
