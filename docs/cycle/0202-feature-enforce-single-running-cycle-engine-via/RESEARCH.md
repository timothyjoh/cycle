I have enough context now. Writing the research document.

```markdown
# Research: Cycle 0202

## Cycle Context

SPEC.md asks for a new `src/engine/engine-lock.ts` module exporting `acquireLock(lockPath)` and `releaseLock(lockPath)`, wired into the supervisor (`src/cli.ts`) before triage begins, with SIGINT/SIGTERM handlers calling `releaseLock` before exit, and the entire drain loop wrapped in a `try/finally` that calls `releaseLock`. The lock uses `.cycle/engine.lock` as its path. A second `cycle run` invocation while one is active should exit non-zero with a message containing the live PID. A stale lock (ESRCH) is silently reclaimed. Coverage floor for the new file must be added to `scripts/coverage-gate.mjs` at 100%.

## Current Codebase State

### Relevant Components

- **Supervisor entry point**: `src/cli.ts` — top-level script (not a class or function). All command dispatching happens inline. The `run` command path is reached after all named-command checks (`init`, `status`, `triage`, `run-one`, `cleanup`, `drop`).
- **Pre-drain setup** (in order): `createLogger` (line 116) → `loadConfig` (line 127) → `emitStaleDistWarning` (line 132) → `log.emit("engine.start")` (line 133) → `runTriage` (line 136) → resume-once check (line 400) → main drain loop (line 423).
- **Main drain loop**: `while (!halted)` starting at `src/cli.ts:423`. No `try/finally` wraps it currently.
- **Process exit**: `process.exit(halted ? 1 : 0)` at `src/cli.ts:551`. No signal handlers currently registered.
- **`cwd` variable**: `const cwd = process.cwd()` at `src/cli.ts:83`. This is the repo root. The `.cycle` dir is accessed throughout via `join(cwd, '.cycle', ...)`.
- **Denylist helper**: `src/engine/path-utils.ts` — `isDenied(p)` returns `true` for any path ending in `.lock` (line 10). `.cycle/engine.lock` is already denied by the `.lock` suffix rule. No change needed there.
- **Exact denylist entry pattern**: `src/engine/path-utils.ts:2` — `DENYLIST_EXACT = [".cycle/cycle.pid"]` shows the pattern for adding a new exact path deny; not required for engine.lock (suffix rule covers it).
- **Coverage gate FLOORS table**: `scripts/coverage-gate.mjs:12-24` — add `"src/engine/engine-lock.ts": 100` here.
- **No existing `src/engine/pid.ts`** — a prior coverage-gate entry was added for it in a past cycle but that file does not exist on disk. No conflict.

### Existing Patterns to Follow

- **Sync fs in signal handlers**: `releaseLock` will be called from SIGINT/SIGTERM handlers where `await` is unavailable. The existing `src/engine/pid.ts`-era pattern (and `cycle stop` handler) used `writeFileSync`/`unlinkSync` from `node:fs` (not `node:fs/promises`). `acquireLock` can also use sync fs since it runs before the async loop.
- **Module structure**: Engine modules in `src/engine/` are plain TypeScript files with named exports. No class wrappers. See `src/engine/path-utils.ts` (12 lines, two exports) and `src/engine/stale-dist.ts` for size/shape references.
- **`buildChildEnv`**: `src/engine/child-env.ts:16` — pattern for a focused utility module with a single exported function.
- **Imports in `src/cli.ts`**: `join` from `node:path` (line 3) and `readFile, readdir, rename, mkdir` from `node:fs/promises` (line 1) are already imported. The planner will need to add a `path.join` call to build `lockPath = join(cwd, '.cycle', 'engine.lock')`.
- **`process.kill(pid, 0)`**: Standard Node.js liveness check. Throws `{ code: 'ESRCH' }` if dead, `{ code: 'EPERM' }` if alive without permission. Neither `ESRCH` nor `EPERM` are used in the current codebase — they come from the OS directly.
- **Unit test pattern for engine modules**: `tests/engine/path-utils.test.ts` — `import { test } from "node:test"`, `import assert from "node:assert/strict"`, direct import of the module under test, no filesystem setup needed for pure-function logic.
- **Integration test pattern**: `tests/cli/halt.test.ts` — `mkdtemp` + `bootstrapRepo` + `seedTodo` + `spawnSync("node", [dist, "run"], { cwd: root })` + `readEvents` + `rm(root, { recursive: true, force: true })` in `finally`. Used for full end-to-end supervisor behavior.
- **`ensureDist()`**: `tests/cli/halt.test.ts:11-15` — required at the top of integration tests that invoke `dist/cycle.js` via `spawnSync`. Tests read the built binary and fail fast if it doesn't exist.

### Dependencies & Integration Points

- **`src/cli.ts` imports** (lines 1-28): `node:fs/promises`, `node:path`, `node:child_process`, plus all engine modules. Adding `import { acquireLock, releaseLock } from "./engine/engine-lock.ts"` follows the existing pattern.
- **Lock path construction**: `join(cwd, '.cycle', 'engine.lock')` — `cwd` is already available at line 83; `join` is already imported.
- **`writeFileSync` / `readFileSync` / `unlinkSync`**: Must be imported from `node:fs` (sync), not `node:fs/promises`. `src/cli.ts` currently only imports from `node:fs/promises`; `node:fs` is not yet imported there.
- **`releaseLock` idempotency**: Must tolerate the file not existing (ENOENT on `unlinkSync`) and the file containing a different PID (another process owns the lock). Use `try/catch` around `unlinkSync`.
- **`process.on('SIGINT')` / `process.on('SIGTERM')`**: Must be registered before the drain loop. No such handlers currently exist in `src/cli.ts`.

### Test Infrastructure

- **Framework**: `node:test` (built-in Node test runner). No Jest, no Vitest.
- **Assertions**: `node:assert/strict`.
- **Test runner invocation**: `npm test` → `pretest` builds first via esbuild → `node --experimental-strip-types --test 'tests/**/*.test.ts'`.
- **Coverage**: `npm run test:coverage` → generates `.cycle/coverage.lcov` → `npm run check:coverage` runs `scripts/coverage-gate.mjs`.
- **Unit test location for new module**: `tests/engine/engine-lock.test.ts` — mirrors the `tests/engine/path-utils.test.ts` shape.
- **Integration test for lock behavior**: Should live in `tests/cli/` alongside `halt.test.ts` and `scope-guard-halt.test.ts`. Use `spawnSync` to launch two concurrent supervisors and assert the second exits non-zero.
- **`expectExactlyOne` helper**: `tests/helpers.ts:3` — use when asserting exactly-once engine events.
- **Current coverage of change area**: `src/cli.ts` has no per-file floor in `coverage-gate.mjs` (only per-engine-module floors). The new `src/engine/engine-lock.ts` requires a 100% floor.

## Code References

- `src/cli.ts:1` — `import { readFile, readdir, rename, mkdir } from "node:fs/promises"` — sync `node:fs` not yet imported here
- `src/cli.ts:83` — `const cwd = process.cwd()` — repo root, used to build lockPath
- `src/cli.ts:116` — `createLogger` — acquireLock must be called before this or just after; issue spec says "before triage begins"
- `src/cli.ts:132-133` — `emitStaleDistWarning` + `engine.start` emit — acquireLock should precede these
- `src/cli.ts:136` — `runTriage(cwd, cfg, log)` — first triage call; lock must be held before here
- `src/cli.ts:399-420` — resume-once block (outside the while loop)
- `src/cli.ts:423` — `while (!halted)` — start of main drain loop; entire loop needs `try/finally { releaseLock }`
- `src/cli.ts:551` — `process.exit(halted ? 1 : 0)` — tail of the supervisor; `releaseLock` in `finally` fires before this
- `src/engine/path-utils.ts:10` — `.lock` suffix rule; `.cycle/engine.lock` already denied
- `scripts/coverage-gate.mjs:12-24` — FLOORS table; add `"src/engine/engine-lock.ts": 100`
- `tests/cli/halt.test.ts:11-42` — `ensureDist` + `bootstrapRepo` helpers — reuse pattern for integration test
- `tests/engine/path-utils.test.ts` — unit test shape for a pure-function engine module

## Open Questions

- **Where exactly to call `acquireLock`**: The spec says "before triage begins." In `src/cli.ts`, the `cfg` check gates `runTriage` (line 135), but `createLogger` (line 116) and `emitStaleDistWarning` (line 132) run before triage regardless. The planner must decide whether `acquireLock` should be called before `createLogger` (maximum exclusion) or after `log` is initialized (so a failure can be logged). The spec does not specify.
- **Lock acquisition when `cfg` is absent**: `cfg` can be null (no `workflows.yml`). The drain loop is guarded by `cfg` checks but the code still runs. The planner must decide whether `acquireLock` is unconditional or gated on `cfg` being present.
- **`node:fs` import placement**: `src/cli.ts` uses only `node:fs/promises`. The planner must add `import { ... } from "node:fs"` for sync operations — or put sync fs calls inside `engine-lock.ts` so `src/cli.ts` only calls the exported functions.
- **Concurrent-process integration test feasibility**: Testing two simultaneous `cycle run` processes from `spawnSync` (which is blocking) requires spawning the first asynchronously. The planner should clarify whether `spawn` (async) + small sleep or a different technique is used in the integration test.
```
