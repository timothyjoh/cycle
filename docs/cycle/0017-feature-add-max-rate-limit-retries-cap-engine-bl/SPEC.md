# SPEC — Cycle 0017: Bound the Rate-Limit Retry Loop with `max_rate_limit_retries`

## Objective
The rate-limit retry loop in `runCycle` (`src/engine/run-cycle.ts`) is currently a `while (true)` that exits only on clean success or a non-rate-limit failure. Under a *permanent* rate-limit condition (invalid API key, banned account, wrong endpoint), the engine pauses for the backoff window, retries, and re-pauses indefinitely — emitting `engine.paused { reason: "rate_limit" }` every hour with no automatic termination. This cycle adds a configurable `max_rate_limit_retries` cap to `EngineConfig` so the loop self-terminates after a bounded number of consecutive rate-limited attempts on a single step, emitting `engine.halted { reason: "rate_limit_max_retries" }` and returning a failed cycle result instead of hanging forever.

## Source Issue
`refl-0256-unbounded-rate-limit-retry-loop-creates-max-retries-cap` — "Add max_rate_limit_retries cap with engine.halted on exhaustion to bound the rate-limit retry loop"

## Scope

### In Scope
- Add `max_rate_limit_retries?: number` to `EngineConfig` (`src/engine/workflow.ts`) and to the `engine:` block of `src/defaults/workflows.yml` (next to `rate_limit_backoff_ms` / `step_timeout_ms`), default `24`; run `npm run sync-defaults`.
- Track a per-step rate-limit retry counter inside the `runCycle` retry loop (`src/engine/run-cycle.ts`); when the counter exceeds the configured cap, emit `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` and return a failed cycle result (terminate the loop, do not continue draining).
- Update documentation (`CLAUDE.md` config list, `docs/ENGINE.md` rate-limit section) and add boundary integration tests in `tests/engine/rate-limit-integration.test.ts`.

### Out of Scope
- Tightening the rate-limit *detection* heuristic (`RATE_LIMIT_PATTERNS` / `isRateLimitError` `"429"` substring false-positive risk) — tracked separately in `inbox/`.
- Changing the backoff duration, the `engine.paused`/`engine.resumed` event shapes, or the supervisor-level `max_consecutive_failures` halt path in `src/cli.ts`.
- Persisting the retry counter across process restarts or across separate cycles — the counter is per-`runCycle`-invocation, per-step, and non-persistent.
- Adding a CLI flag override for the cap; configuration is via `workflows.yml` only.

## Requirements
- `EngineConfig.max_rate_limit_retries` is an optional `number`; resolved at the read site with a default of `24` when absent. A `0`, negative, non-integer, or otherwise malformed value must be handled defensively at the read site (treat as the default `24`) rather than producing an unbounded or zero-length loop by accident — document the chosen coercion in the code comment.
- The counter counts only consecutive rate-limited attempts of the *current* step within a single `runCycle` call. The existing behavior is preserved exactly while the counter is at or below the cap: `engine.paused { reason: "rate_limit", retry_at }`, sleep `rate_limit_backoff_ms`, retry the same step index; a clean success after a rate-limited attempt still emits `engine.resumed { reason: "rate_limit_cleared" }`.
- On the first attempt that pushes the count past the cap, the loop must stop *before* sleeping/retrying again: emit `engine.halted { reason: "rate_limit_max_retries", retries: N, step_index: i }` and return `{ cycleId, artifactDir, status: "failed", failingStep: step.name }` so the caller routes it through the unchanged terminal-failure path.
- The `engine.halted` `retries` field carries the actual number of rate-limited attempts observed (not the cap value, unless they coincide).
- The retry counter increments only on `r.rateLimited` results; a non-rate-limit failure or success continues to break/exit the loop exactly as today, leaving non-rate-limit control flow untouched.
- With the flag absent from a repo's `workflows.yml`, the default `24` applies and no behavior visible to a normally-operating engine changes.
- **Failure behavior**: A malformed/zero/negative configured cap degrades to the default `24` (logged implicitly via the resolved value used; never silently produces an infinite or zero-retry loop). When the cap is exceeded, the engine surfaces termination via the `engine.halted` event (never a silent kill) and returns a failed cycle result — the failure is observable in `.cycle/log.jsonl` and propagates to the supervisor's terminal-failure accounting. The `finally` block's checkout/base-pull bookkeeping still runs on the early `return`, so no cleanup is skipped.

## Acceptance Criteria
- [ ] `EngineConfig.max_rate_limit_retries?: number` exists in `src/engine/workflow.ts` and `src/defaults/workflows.yml` `engine:` block has `max_rate_limit_retries: 24`; `npm run sync-defaults` leaves `.cycle/workflows.yml` in sync (no diff).
- [ ] Integration test: an agent that rate-limits exactly `max_rate_limit_retries` times then succeeds does NOT emit `engine.halted` and the cycle completes (`cycle.end status: ok`).
- [ ] Integration test: an agent that rate-limits `max_rate_limit_retries + 1` times emits exactly one `engine.halted { reason: "rate_limit_max_retries" }` and the cycle returns `status: "failed"` (no further step execution).
- [ ] The emitted `engine.halted` event carries the correct `retries` count and a `step_index` matching the rate-limited step.
- [ ] Failure-path criterion: with `max_rate_limit_retries` configured to `0` (or a negative/non-integer value), the loop falls back to the default `24` rather than halting immediately or looping forever — covered by a test asserting the effective cap is `24`.
- [ ] `CLAUDE.md` config list and `docs/ENGINE.md` "Rate-Limit Pause/Retry Loop" section document the cap and the `rate_limit_max_retries` halt reason (the "Known limitation: unbounded" note is updated/removed).
- [ ] `npm run test:coverage` passes all coverage gates (including the `src/engine/run-cycle.ts` 90% per-file floor).
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Framework: `node:test` with the existing `RunCycleOpts.sleepFn` injection seam to avoid real backoff sleeps; build a rate-limit-returning agent stub as in the existing `tests/engine/rate-limit-integration.test.ts`.
- Key scenarios:
  - **Happy path / boundary-below**: rate-limit `cap` times then succeed → no `engine.halted`, cycle ok, exactly one `engine.resumed`.
  - **Failure path / boundary-above**: rate-limit `cap + 1` times → exactly one `engine.halted { reason: "rate_limit_max_retries" }` (cardinality-pinned via `filter(...).length === 1` per the exactly-once test convention), `status: "failed"`, and no subsequent `step.start` for later steps.
  - **Bad config**: `max_rate_limit_retries: 0` / negative / non-integer → effective cap resolves to default `24` (assert via behavior or the resolved value).
  - **Regression**: the existing single-retry-then-success path still emits `engine.paused` then `engine.resumed` unchanged.
- No UI changes; no E2E/Playwright required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add `engine.max_rate_limit_retries` to the "Workflow defaults" config list (default `24`, semantics: per-step consecutive rate-limit cap, halt reason `rate_limit_max_retries`). Update the `src/engine/run-cycle.ts` rate-limit retry-loop note to state the loop is now bounded.
- **README.md**: No user-facing README change required (engine-internal config).
- **docs/ENGINE.md**: In "Rate-Limit Pause/Retry Loop", replace the "Known limitation: unbounded" note with the cap description, the `rate_limit_max_retries` halt reason, the `retries`/`step_index` event fields, and the default-`24` coercion of malformed values.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing rate-limit machinery: `StepResult.rateLimited` (`src/engine/exec-bash.ts`), `isRateLimitError` (`src/engine/rate-limit.ts`), the `runCycle` retry loop and its `sleepFn` seam (`src/engine/run-cycle.ts`).
- `EngineConfig` typing and `loadConfig` resolution (`src/engine/workflow.ts`); defaults sync via `npm run sync-defaults` (`scripts/sync-defaults.mjs`).
- No new external services or environment variables.
