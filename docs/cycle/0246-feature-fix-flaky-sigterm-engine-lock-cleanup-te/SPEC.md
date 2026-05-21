# SPEC — Cycle 0246: Fix Flaky SIGTERM Engine-Lock Cleanup Test with Deterministic Poll Handshake

## Objective

Replace the bare immediate assertion after `child.on("exit")` in the SIGTERM engine-lock integration test with a `waitForAbsence` poll helper that retries until the lock file disappears or a timeout expires. The current code asserts lock absence immediately after the child exit event fires, but `releaseLock` (an async `unlink`) may not complete before the assertion runs under load or on slow CI runners. This cycle delivers a single, targeted fix that eliminates the race and restores trust in the `engine-lock.ts` 100% coverage gate.

## Source Issue

`refl-0227-flaky-sigterm-engine-lock-cleanup-test-c` — "Fix flaky SIGTERM engine-lock cleanup test with deterministic poll handshake"

## Scope

### In Scope

- Add a `waitForAbsence(filePath, options)` poll helper in `tests/cli/engine-lock-integration.test.ts`
- Replace the bare `readFile`/`lockExists` assertion block at line 235–241 with `await waitForAbsence(lockPath)`
- Verify the fix by running the isolated test 10 consecutive times

### Out of Scope

- Fixing the analogous SIGINT test (lines 197–203), which has the same pattern but is not reported flaky
- Modifying `src/engine/engine-lock.ts` source code
- Changing test infrastructure outside this single test file

## Requirements

- `waitForAbsence` must poll with a configurable interval (default 50 ms) until the file is absent (`ENOENT`) or a configurable timeout (default 2000 ms) elapses, then throw a descriptive error on timeout
- Non-`ENOENT` errors from `stat` must propagate immediately, not be silently swallowed
- The SIGTERM test must not contain any fixed `sleep`/`setTimeout` delay in the lock-absence assertion path
- `engine-lock.ts` must remain at 100% line and branch coverage after the change

## Acceptance Criteria

- [ ] `waitForAbsence` helper is defined in `tests/cli/engine-lock-integration.test.ts` with `timeout` and `interval` options
- [ ] Lines 235–241 of the SIGTERM test no longer use the bare `readFile`/`lockExists` pattern; `waitForAbsence(lockPath)` is called instead
- [ ] No fixed `setTimeout`/sleep remains in the SIGTERM lock-absence assertion path
- [ ] The isolated test passes in 10 consecutive runs: `node --experimental-strip-types node_modules/.bin/vitest run tests/cli/engine-lock-integration.test.ts --reporter=verbose`
- [ ] `npm test` passes with zero failures
- [ ] `npm run check:coverage` passes with `engine-lock.ts` at 100% line coverage
- [ ] `npm run check:invariants` passes

## Testing Strategy

- Node built-in test runner via Vitest (existing suite)
- Run isolated: `node --experimental-strip-types node_modules/.bin/vitest run tests/cli/engine-lock-integration.test.ts --reporter=verbose` × 10 to confirm determinism
- Run full suite: `npm test` to confirm no regressions
- Coverage enforcement: `npm run check:coverage` must pass with `engine-lock.ts` at 100%

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No convention changes; no update required
- **README.md**: No user-facing change; no update required

## Dependencies

- `dist/cycle.js` must be built (`npm run build`) before integration tests run; `npm test` handles this via `pretest`
- Node ≥ 22.6 with `--experimental-strip-types` (existing requirement)
