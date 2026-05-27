# SPEC — Cycle 0258: SIGTERM Handler: Emit `cycle.killed` Event Before Exit

## Objective

This cycle adds a structured audit log entry when the cycle engine process is terminated via SIGTERM. Currently the SIGTERM handler calls `process.exit(143)` immediately, leaving no record that distinguishes an intentional kill from a crash. After this change, the handler will synchronously append a `cycle.killed` event to `.cycle/log.jsonl` — including the active `cycle_id` and a timestamp — before exiting, so operators and parent agents can tell kill from crash by reading the log.

## Source Issue

`mentor-sigterm-graceful-shutdown-emit-killed` — "SIGTERM handler: emit cycle.killed event to log before exit"

## Scope

### In Scope

- Re-register the SIGTERM handler in `src/cli.ts` after `log` is created, using the logger to emit `cycle.killed` before `process.exit(143)`
- Track the active `cycle_id` in a module-level variable so the handler can include it at signal time
- Unit/integration test: send SIGTERM to a running engine process and assert `cycle.killed` appears in the log

### Out of Scope

- SIGINT behavior changes (SIGINT remains `process.exit(130)` with no log write)
- Subprocess draining or graceful teardown on SIGTERM
- Any changes to the engine lock release path (`process.on("exit")` handler is untouched)
- Handling SIGTERM before `log` is created (early-exit paths before logger init keep the current no-log behavior)

## Requirements

- The SIGTERM handler must write a `cycle.killed` event with fields `{ cycle_id: string | undefined, ts: string }` to the log before calling `process.exit(143)`.
- The log write must be synchronous (using `appendFileSync` or equivalent) — the handler cannot `await`.
- `cycle_id` must reflect the cycle active at signal time; if no cycle is in progress, the field should be `undefined` (not thrown).
- The handler must be registered after `log` (and thus the logger) is initialized at line 154 of `src/cli.ts`, replacing or superseding the earlier registration at line 152.
- Exit code remains `143`. No other exit semantics change.
- The existing `process.on("exit")` lock-release handler is not modified.

## Acceptance Criteria

- [ ] SIGTERM handler emits `{ event: "cycle.killed", cycle_id: <id or undefined>, ts: <ISO string> }` to `.cycle/log.jsonl` before exiting
- [ ] Process exits with code 143 immediately after the log write (no drain, no subprocess wait)
- [ ] SIGINT still exits with code 130 and no log write
- [ ] Engine lock is still released via the existing `process.on("exit")` handler (no change to that path)
- [ ] Test: spawning the engine and sending SIGTERM produces a `cycle.killed` entry in log.jsonl
- [ ] All existing tests pass (`npm test`)
- [ ] No TypeScript errors (`npm run typecheck`)

## Testing Strategy

- Use Node's built-in test runner (`node:test`) consistent with existing test conventions
- Spawn the engine process (or a minimal harness) and send SIGTERM; read `.cycle/log.jsonl` and assert a `cycle.killed` entry is present
- Test with an active cycle: send SIGTERM mid-run and assert `cycle_id` is populated
- Test with no active cycle: send SIGTERM before any cycle starts and assert `cycle_id` is `undefined` (not an error)
- Verify exit code is 143 and process terminates promptly (no hang)

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No convention changes; no new commands
- **README.md**: No user-facing change required — `cycle.killed` is an internal audit event, not a user-facing behavior change

## Dependencies

- `src/engine/log.ts` — `Logger` type and `createLogger` already exist; the synchronous write path may require exposing or duplicating the JSONL append using `node:fs` `appendFileSync`
- Node ≥ 22.6 (already required); `appendFileSync` is available in all Node versions
- No external services or new env vars required
