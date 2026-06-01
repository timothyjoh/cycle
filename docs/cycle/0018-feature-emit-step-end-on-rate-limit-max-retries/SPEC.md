# SPEC — Cycle 0018: Emit step.end on rate-limit-max-retries halt path

## Objective
The `rate_limit_max_retries` halt branch in `runCycle` (`src/engine/run-cycle.ts`) emits `engine.halted` and `cycle.end` and returns early — but it returns *before* the shared `step.end` emission. This is the only terminal path in the cycle loop that leaves a dangling `step.start` with no matching `step.end`, producing a start/end asymmetry that breaks every log consumer pairing those events. This cycle delivers a single `step.end` (status `failed`, carrying the accumulated `duration_ms`) immediately before the `engine.halted`/`cycle.end` block in that branch, so the rate-limit-exhaustion halt produces the same `step.start`/`step.end` pairing and event ordering as every other failure path.

## Source Issue
`refl-0017-rate-limit-max-retries-halt-skips-step-e` — "Emit step.end on rate-limit-max-retries halt path in runCycle"

## Scope

### In Scope
- Emit exactly one `step.end` (status `failed`, with a `duration_ms` computed from the step's `stepStart`/`nowFn()`) in the `rate_limit_max_retries` branch (`src/engine/run-cycle.ts` ~lines 437–445), immediately before the existing `engine.halted` emission, while preserving the early return through the `finally` checkout/base-pull cleanup.
- A test asserting the `cap + 1`-th rate-limited attempt (increment-then-compare boundary-above) emits a `step.end` for the rate-limited step, with ordering `step.end` → `engine.halted` → `cycle.end`, pinned exactly-once.

### Out of Scope
- Any change to the retry-count / cap semantics, backoff, or the `engine.halted` / `cycle.end` payloads themselves.
- Tightening the `RATE_LIMIT_PATTERNS` `"429"` substring matcher (tracked separately in `inbox/`).
- Changes to the iteration-too-fast guard or `readCycleEndFailure` beyond what is unblocked by the new `step.end` emission.
- The normal rate-limit pause/retry/resume path (not a halt).

## Requirements
- The `rate_limit_max_retries` halt branch emits one `step.end` event before `engine.halted`. Its payload mirrors the shared `step.end` emission at the other terminal paths: `cycle_id`, `step` (the rate-limited step's name), `status: "failed"`, `exit_code` (the rate-limited result's exit code), and a non-negative integer `duration_ms` derived from `Math.max(0, Math.round(nowFn() - stepStart))`. The failed-step `stderr` excerpt field should follow the existing `step.end` convention for failed steps.
- Event ordering on this path: `step.end` precedes `engine.halted` precedes `cycle.end`.
- The early return still returns `{ cycleId, artifactDir, status: "failed", failingStep: step.name }` and still flows through the `finally` block (no behavior change to checkout/base-pull cleanup).
- No second `step.end` is emitted for the same step on this path — the new emission must not also fall through to the shared emission at the loop bottom.
- **Failure behavior**: This path *is* the failure path — it fires only when a single step has been rate-limited more than `engine.max_rate_limit_retries` times. The fix must not introduce a silent kill: the halt remains observable via `step.end` (new) + `engine.halted` + `cycle.end`. If `nowFn`/`stepStart` are unavailable or yield a negative delta, `duration_ms` clamps to `0` (never negative, never omitted). The added emission must not throw or mask the terminal-failure return; the engine still returns a failed cycle result.

## Acceptance Criteria
- [ ] On the `cap + 1`-th rate-limited attempt for one step within a single `runCycle`, the emitted events include exactly one `step.end` for that step, with `status: "failed"` and an integer `duration_ms`, asserted via `filter(...).length === 1` / `expectExactlyOne`.
- [ ] The `step.end` for the rate-limited step is emitted before `engine.halted { reason: "rate_limit_max_retries" }`, which is emitted before `cycle.end { status: "failed" }` — verified by event index ordering in the test.
- [ ] Rate-limiting a step exactly `cap` times followed by a clean success still completes the cycle and emits its `step.end` via the normal success path (no spurious halt-path `step.end`) — existing retry/halt behavior unregressed.
- [ ] `runCycle` returns `{ status: "failed", failingStep: <rate-limited step name> }` on the halt path and the `finally` checkout/base-pull cleanup still runs (existing assertion remains green).
- [ ] All existing tests still pass, including the existing rate-limit retry/halt tests.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner (`npm run test:coverage`), extending the existing rate-limit retry/halt tests in the `run-cycle` test suite.
- Key scenarios:
  - **Failure/halt path**: rate-limit a single step `cap + 1` times (injecting `sleepFn` to skip real backoff); assert the new `step.end` exists exactly once, carries `status: "failed"` and an integer `duration_ms`, and that `step.end` → `engine.halted` → `cycle.end` ordering holds.
  - **Boundary-below regression**: rate-limit exactly `cap` times then succeed; assert no halt-path `step.end` is emitted and the cycle completes normally.
  - **start/end pairing**: assert the rate-limited step has matching `step.start` and `step.end` counts on the halt path.
- Use `expectExactlyOne` from `tests/helpers.ts` where the `step.end` payload is inspected; use cardinality-pinned `filter(...).length === 1` for exactly-once assertions.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `engine.max_rate_limit_retries` note (under *Workflow defaults*) and the `run-cycle.ts` rate-limit retry-loop note to state that the `rate_limit_max_retries` halt path now emits `step.end` (status `failed`, with `duration_ms`) before `engine.halted` → `cycle.end`, matching all other terminal paths.
- **README.md**: No user-facing change (internal event-emission correctness); no update required.
- **docs/ENGINE.md**: If the halt-policy / rate-limit section enumerates terminal-path event ordering, add the `step.end` emission to the `rate_limit_max_retries` path description.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `runCycle` rate-limit retry loop and `engine.max_rate_limit_retries` cap (`src/engine/run-cycle.ts`).
- The shared `step.end` emission shape, `truncateHeadCapped`/`MAX_STEP_END_STDERR`, and the `stepStart`/`nowFn` duration mechanics already present in the loop.
- `RunCycleOpts.sleepFn` injection for deterministic backoff-free tests; `expectExactlyOne` helper in `tests/helpers.ts`.
- No external services or env vars required.
