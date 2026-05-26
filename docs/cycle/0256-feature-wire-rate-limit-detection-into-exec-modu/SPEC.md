# SPEC — Cycle 0256: Wire Rate-Limit Detection into Exec Modules and run-cycle Pause/Retry Loop

## Objective

This cycle wires the `isRateLimitError` helper (shipped in cycle 0255) into all six exec modules and into `run-cycle.ts`. When a step returns a rate-limit signal, the engine must not penalize `consecutive_failures`; instead it emits `engine.paused { reason: "rate_limit", retry_at }`, sleeps a configurable backoff period, retries the same step, and emits `engine.resumed { reason: "rate_limit_cleared" }` on recovery. This closes the gap between the documented event contract (`engine.paused`/`engine.resumed`) and the engine's actual behavior, and prevents rate-limited runs from burning failure budget and halting the queue.

## Source Issue

`mentor-rate-limit-docs-vs-code-engine-integration` — "Wire rate-limit detection into exec modules and run-cycle pause/retry loop"

## Scope

### In Scope

- Add a `rateLimited` flag to `StepResult` (or an equivalent signal) so exec modules can surface rate-limit outcomes without polluting `status: "failed"`.
- Import and call `isRateLimitError` in all six agent exec modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`); set the flag when the helper returns `true`.
- Update `run-cycle.ts` step dispatch to detect the flag: skip `consecutive_failures` increment, emit `engine.paused`, sleep backoff, retry, and emit `engine.resumed` on first clean retry.
- Add `engine.rate_limit_backoff_ms: 3600000` to `src/defaults/workflows.yml` and run `npm run sync-defaults`.
- Unit tests covering: pause event emission, no `consecutive_failures` increment, retry after backoff, resumed event emission.

### Out of Scope

- Wiring rate-limit detection into `exec-bash.ts` or bash steps (bash steps are plain scripts; rate-limit semantics apply to AI agent APIs only).
- Tightening the `"429"` bare-substring pattern (tracked separately in `raw/`).
- Documentation-only docs-update cycle (`mentor-rate-limit-docs-vs-code-docs-update` is a sibling issue).
- Any UI or CLI surface changes.

## Requirements

- `StepResult` (defined in `exec-bash.ts`) must gain a `rateLimited?: true` optional field; existing callers that do not set it remain valid (field absent = `false`).
- Each of the six agent exec modules must call `isRateLimitError({ exitCode, stderr, stdout })` on the raw spawn result and, when it returns `true`, produce a `StepResult` with `rateLimited: true` (and `status: "failed"` so legacy code that does not check the flag behaves safely).
- `run-cycle.ts` must check `r.rateLimited` before evaluating `r.status === "failed"`. When `true`:
  1. Do not increment `consecutive_failures` (or any failure counter).
  2. Read `cfg.engine.rate_limit_backoff_ms` (default `3_600_000`).
  3. Emit `engine.paused { reason: "rate_limit", retry_at: <ISO string> }` to the event log.
  4. Sleep `backoffMs` ms.
  5. Re-run the same step (loop iteration restarts without advancing `i`).
  6. On first step result with `rateLimited` absent/false and `status: "ok"`, emit `engine.resumed { reason: "rate_limit_cleared" }`.
- The retry loop must not suppress non-rate-limit failures: if a retry returns `status: "failed"` with `rateLimited` absent, the normal failure path (cycle.end + return) must be taken.
- `engine.rate_limit_backoff_ms` must be present in `src/defaults/workflows.yml` under the `engine:` key and propagated to `.cycle/workflows.yml` via `sync-defaults`.
- The `WorkflowConfig` / engine config type must be extended to include `rate_limit_backoff_ms?: number`.

## Acceptance Criteria

- [ ] `StepResult` has an optional `rateLimited?: true` field.
- [ ] All six agent exec modules (`exec-claudecode.ts`, `exec-codex.ts`, `exec-auggie.ts`, `exec-gemini.ts`, `exec-opencode.ts`, `exec-pi.ts`) import `isRateLimitError` and set `rateLimited: true` when it returns `true`.
- [ ] `exec-bash.ts` is not modified (bash steps are excluded from rate-limit detection).
- [ ] `run-cycle.ts` emits `engine.paused { reason: "rate_limit", retry_at }` when a step returns `rateLimited: true`.
- [ ] A rate-limited step does not increment `consecutive_failures`.
- [ ] The engine sleeps `engine.rate_limit_backoff_ms` ms (default `3_600_000`) and retries the same step index.
- [ ] After a successful retry, `engine.resumed { reason: "rate_limit_cleared" }` is emitted.
- [ ] A retry that fails without a rate-limit signal takes the normal failure path (no `engine.resumed`, cycle ends as failed).
- [ ] `engine.rate_limit_backoff_ms: 3600000` is present in `src/defaults/workflows.yml`.
- [ ] `.cycle/workflows.yml` reflects the new key after `npm run sync-defaults`.
- [ ] Tests cover: pause event emitted, `consecutive_failures` not incremented, retry triggered, resumed event emitted on recovery.
- [ ] `npm test` passes; all per-file coverage floors maintained.
- [ ] `npm run typecheck` passes with zero errors.

## Testing Strategy

- Framework: `node:test` with `node --experimental-strip-types`, matching all existing engine test conventions.
- New test file: `tests/engine/rate-limit-integration.test.ts` (or extend `tests/engine/run-cycle.test.ts` if that file exists and the pattern fits).
- Key scenarios:
  - Happy path: step returns `rateLimited: true` once, then `status: "ok"` — verify `engine.paused` emitted, `engine.resumed` emitted, cycle completes `status: "ok"`, `consecutive_failures` not incremented.
  - Persistent rate-limit: step returns `rateLimited: true` twice then succeeds — verify two `engine.paused` events, one `engine.resumed`.
  - Rate-limit then hard failure: step returns `rateLimited: true` then `status: "failed"` without `rateLimited` — verify `engine.resumed` NOT emitted, `cycle.end { status: "failed" }` emitted.
  - Normal failure baseline: step returns `status: "failed"` without `rateLimited` — verify existing behavior unchanged (no pause/resume events, `consecutive_failures` incremented normally).
- Backoff sleep must be injectable (accept a `sleepFn` parameter or use `mock.timers`) so tests do not wait 1 hour.
- `isRateLimitError` unit behavior is already covered in `tests/engine/rate-limit.test.ts`; do not duplicate those cases here.

## Documentation Updates

- **CLAUDE.md**: Add `src/engine/run-cycle.ts` rate-limit retry behavior note to the Architecture section; document `engine.rate_limit_backoff_ms` config key.
- **docs/ENGINE.md**: Document the pause/retry loop, the `engine.paused` and `engine.resumed` events, and the `rateLimited` field on `StepResult`.
- **README.md**: No user-facing change required.

## Dependencies

- `src/engine/rate-limit.ts` and its exported `isRateLimitError` function must already exist (shipped in cycle 0255; confirmed present).
- `src/engine/workflow.ts` must expose the engine config type that can be extended with `rate_limit_backoff_ms`; verify the type shape before editing.
- No external services or new environment variables required.
