# Research: Cycle 0246

## Cycle Context

Cycle 0246 targets a single flaky integration test in `tests/cli/engine-lock-integration.test.ts`. The SIGTERM test ("SIGTERM → supervisor exits, lock cleaned up") performs a bare `readFile`/`lockExists` check immediately after `child.on("exit")` fires, but `releaseLock` (which calls `unlinkSync` synchronously inside the child's `exit` event handler) may not be observable in the parent's filesystem view before the parent test assertion runs under load. The fix is to add a `waitForAbsence` poll helper in the same test file and replace lines 235–241 with `await waitForAbsence(lockPath)`. No source code changes to `engine-lock.ts` are in scope.

## Current Codebase State

### Relevant Components

- **Integration test file**: `tests/cli/engine-lock-integration.test.ts` — four tests covering live-lock, stale-lock, SIGINT, and SIGTERM scenarios; written using `node:test` runner.
- **Signal handlers and lock lifecycle in CLI entry point**: `src/cli.ts:126–128` — registers `process.on("exit", () => releaseLock(lockPath))`, `process.on("SIGINT", () => process.exit(130))`, `process.on("SIGTERM", () => process.exit(143))`.
- **Engine lock implementation**: `src/engine/engine-lock.ts` — exports `acquireLock` and `releaseLock`; uses synchronous `node:fs` ops (`readFileSync`, `writeFileSync`, `unlinkSync`) via an injectable `LockDeps` interface; `releaseLock` calls `unlinkSync` inside a try/catch that swallows `ENOENT`.
- **Unit test file**: `tests/engine/engine-lock.test.ts` — 6 unit tests covering all branches of `acquireLock`/`releaseLock` using injected fake deps; no filesystem interaction.

### Existing Patterns to Follow

- **`waitForLock` poll helper** (`tests/cli/engine-lock-integration.test.ts:157–169`): retries `readFile(lockPath)` every 100 ms until success or `timeoutMs` (default 10,000 ms) elapses. This is the inverse of the needed `waitForAbsence` — same shape, opposite success condition. New helper should follow the same function signature convention.
- **`Promise.race` for signal-wait with timeout** (`tests/cli/engine-lock-integration.test.ts:190–195`, `228–233`): used in both SIGINT and SIGTERM tests to wait for child exit with a 5,000 ms reject timeout. `waitForAbsence` must not replace this; it replaces only the assertion block after the race settles.
- **`readFile`-based existence check**: both SIGINT (lines 197–203) and SIGTERM (lines 235–241) use the same `try { await readFile(...) } catch { lockExists = false }` pattern. SPEC scopes the fix to SIGTERM only (lines 235–241); SIGINT pattern at lines 197–203 is out of scope.
- **`stat`-based file-presence checks**: `stat` imported from `node:fs/promises` appears in other test files (`tests/engine/run-cycle.test.ts:3`, `tests/engine/blocked.test.ts:3`, `tests/engine/reflection.test.ts:3`). The issue file's recommended `waitForAbsence` uses `stat` rather than `readFile` to detect absence — `stat` throws `ENOENT` on absence without reading file content, which is the conventional approach for existence polling.

### Dependencies & Integration Points

- **`node:fs/promises`** is already imported at `tests/cli/engine-lock-integration.test.ts:3` for `mkdtemp`, `rm`, `writeFile`, `readFile`, `mkdir`, `chmod`, `appendFile`. Adding `stat` requires extending this import.
- **`dist/cycle.js`** is the built bundle under test; the integration tests spawn it as a subprocess via `spawn("node", [dist, "run"], ...)`. `ensureDist()` at line 10–14 verifies the bundle exists; `npm test` invokes `npm run build` first via `pretest`.
- **Signal delivery chain**: SIGTERM → child `process.on("SIGTERM")` → `process.exit(143)` → child `process.on("exit")` → `releaseLock(lockPath)` → `unlinkSync(lockPath)` → child OS-exits → parent receives `child.on("exit")`. The `unlinkSync` is synchronous within the child but the parent's view of the filesystem may lag behind the child's OS exit notification under load.

### Test Infrastructure

- **Test runner**: `node:test` (Node built-in), invoked via `node --test --experimental-strip-types`. Not Vitest — the SPEC references a `vitest` CLI invocation but the actual test runner used in CI and `npm test` is the Node built-in `--test` flag.
- **Test file naming**: `tests/cli/engine-lock-integration.test.ts` — follows `*.test.ts` convention under `tests/<area>/`.
- **`node:fs/promises` stubbing**: CLAUDE.md documents that `node:fs/promises` cannot be stubbed via `mock.method` (ESM non-configurable). Not relevant here since the integration tests use real filesystem operations with temp dirs.
- **Temp directory lifecycle**: each test creates a `mkdtemp` root and tears it down in `finally { await rm(root, { recursive: true, force: true }) }`.
- **Coverage gate**: `scripts/coverage-gate.mjs:24` enforces `src/engine/engine-lock.ts` at 100% line coverage. The fix touches only the test file, so `engine-lock.ts` coverage must not regress. Unit tests in `tests/engine/engine-lock.test.ts` cover all source branches independently of the integration test.

## Code References

- `tests/cli/engine-lock-integration.test.ts:1–6` — imports: `node:test`, `node:assert/strict`, `node:fs/promises` (no `stat`), `node:path`, `node:os`, `node:child_process`
- `tests/cli/engine-lock-integration.test.ts:157–169` — `waitForLock` poll helper; structural model for `waitForAbsence`
- `tests/cli/engine-lock-integration.test.ts:209–245` — full SIGTERM test; the assertion block at lines 235–241 is the fix target
- `tests/cli/engine-lock-integration.test.ts:228–233` — `Promise.race` for child exit + 5,000 ms timeout; must remain unchanged
- `tests/cli/engine-lock-integration.test.ts:171–207` — SIGINT test; lines 197–203 have the same bare pattern but are **out of scope**
- `src/cli.ts:126–128` — signal and exit handler registration in the supervised process
- `src/engine/engine-lock.ts:43–52` — `releaseLock` implementation; uses `unlinkSync`; no async I/O
- `scripts/coverage-gate.mjs:24` — `"src/engine/engine-lock.ts": 100` floor

## Open Questions

- The SPEC and issue reference `stat` as the probe in `waitForAbsence`, but `stat` is not currently imported in `engine-lock-integration.test.ts`. The planner should confirm whether to add `stat` to the existing `node:fs/promises` import line or use an alternative (e.g., `readFile` with a catch on `ENOENT`, consistent with the SIGINT pattern).
- The SPEC says "No fixed `setTimeout`/sleep remains in the SIGTERM lock-absence assertion path" — the 5,000 ms `setTimeout` in the `Promise.race` at lines 228–233 is a timeout guard for child exit, not the lock-absence assertion path. The planner should confirm this timeout guard is not in scope for removal.
- The SPEC references running the test with `node --experimental-strip-types node_modules/.bin/vitest run` — the actual test runner is `node:test` (not Vitest). The planner should verify whether a Vitest shim is present in `node_modules/.bin/vitest` or adjust the iteration command to use `node --test --experimental-strip-types tests/cli/engine-lock-integration.test.ts`.
