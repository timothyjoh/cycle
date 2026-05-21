# Research: Cycle 0225

## Cycle Context

Cycle 0225 adds `src/engine/dot-env.ts`, a hand-rolled `.cycle/.env` loader that fires at engine bootstrap in `src/cli.ts` between the `--trunk` flag check (line 137) and `loadConfig()` (line 139). Currently, `CYCLE_TRUNK_BASED=1` in `.cycle/.env` has no effect because nothing reads that file — the variable only takes effect when already exported in the shell or passed via `--trunk`. The shipped default is `commit.mode: worktree-pr`, so repos relying solely on `.cycle/.env` silently run worktree-pr mode. The new module parses `KEY=VALUE` lines with real-env-wins semantics, silently skips blank lines, `#`-prefixed lines, and lines without `=`, and no-ops on `ENOENT`.

## Current Codebase State

### Relevant Components

- **`--trunk` flag handler**: `src/cli.ts:137` — `if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1";` sets the env var before `loadConfig()` is called at line 139. The insertion point for `loadDotEnv` is between these two lines (i.e., at the current line 138 position, which is blank).
- **`loadConfig()`**: `src/engine/workflow.ts:46` — async function; accepts optional `env` param defaulting to `process.env`. At lines 86–88 it reads `env.CYCLE_TRUNK_BASED === "1"` and overrides `commitConfig.mode` to `"trunk"`. This is the only consumer of `CYCLE_TRUNK_BASED`.
- **Lock acquisition**: `src/cli.ts:117–123` — `acquireLock(lockPath)` runs before the `--trunk` check at line 137; `loadDotEnv` must run after line 124 (signal handlers) and before line 139.
- **`src/engine/engine-lock.ts`**: canonical small synchronous utility module — uses `readFileSync` from `"node:fs"`, no async, injectable `deps` object for testability, 100% floor in coverage gate.
- **`src/engine/child-env.ts`**: canonical small synchronous utility module — uses synchronous ops, no external dependencies, 100% floor.
- **`src/engine/path-utils.ts`**: canonical small pure utility module — no fs I/O, 100% floor.
- **`scripts/coverage-gate.mjs`**: `FLOORS` table at lines 12–27; add `"src/engine/dot-env.ts": 100` as a new entry following the same pattern as `"src/engine/path-utils.ts": 100`, `"src/engine/engine-lock.ts": 100`, `"src/engine/child-env.ts": 100`.
- **`src/defaults/workflows.yml`**: ships `commit.mode: worktree-pr` (the default the `.env` override is intended to override); out of scope for this cycle.
- **`docs/ENGINE.md`**: commit mode section at line 155 documents `mode: trunk | local-only | worktree-pr`; line 171 documents `cycle.checkout status:skipped reason:"trunk"`. A note about `loadDotEnv(.cycle/.env)` running before `loadConfig()` belongs here.

### Existing Patterns to Follow

- **Synchronous fs with ENOENT guard**: `src/engine/engine-lock.ts:17–39` — wraps `readFileSync` in a try/catch; catches `ENOENT` (code check: `err.code !== "ENOENT"`) and re-throws non-ENOENT errors; otherwise returns. `dot-env.ts` follows the same pattern for `ENOENT` no-op.
- **Injectable deps for testability**: `engine-lock.ts` passes a `deps` object to both exported functions so tests supply fakes without touching the filesystem. `dot-env.ts` does not need this (SPEC calls for `os.tmpdir()` + random filenames instead), but the sync-read + ENOENT pattern is identical.
- **Real-fs tests with tmpdir**: `tests/engine/child-env.test.ts:3–5` and `tests/engine/workflow.test.ts:3–5` — import `mkdtemp`, `rm`, etc. from `"node:fs/promises"`; use `join(tmpdir(), "cycle-test-")` prefix; always clean up in a `finally` block.
- **`process.env` mutation + restore**: `tests/engine/workflow.test.ts:224–232` and lines 304–332 — save `prev = process.env.CYCLE_TRUNK_BASED`, mutate, restore in `finally` with `if (prev === undefined) delete process.env.CYCLE_TRUNK_BASED; else process.env.CYCLE_TRUNK_BASED = prev`. Tests for `dot-env.ts` that mutate `process.env` must follow this exact save/restore pattern.
- **`node:test` + `node:assert/strict`**: all test files use `import { test } from "node:test"` and `import assert from "node:assert/strict"` (or `{ strict as assert }`). No external test framework.
- **Integration smoke via `loadConfig`**: `tests/engine/workflow.test.ts:302–333` — sets `process.env.CYCLE_TRUNK_BASED`, calls `loadConfig(root)`, asserts `cfg.engine.commit.mode`. The integration smoke for `dot-env.ts` replicates this: call `loadDotEnv(tmpFile)`, then call `loadConfig(root)`, assert `commit.mode === "trunk"`.

### Dependencies & Integration Points

- **`src/cli.ts` import list** (`src/cli.ts:1–29`): imports are all from `"node:*"`, local `./engine/*`, and `./cli/*`. `dot-env.ts` will be imported as `import { loadDotEnv } from "./engine/dot-env.ts"` following the same pattern as the existing `engine-lock` import at line 27.
- **Call site**: `src/cli.ts:137–139` — the insertion is one new line between `if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1";` (line 137) and `const cfg = await loadConfig(cwd);` (line 139). The `.cycle/` directory path is already available as `join(cwd, ".cycle", "engine.lock")` at line 117, so the same `join(cwd, ".cycle", ".env")` pattern is available.
- **`loadConfig` env parameter**: `src/engine/workflow.ts:46` — accepts `env: Record<string, string | undefined> = process.env`. Because `loadDotEnv` sets values on `process.env` directly, the default `env` argument already picks up the new values with no changes to `loadConfig`.
- **`buildChildEnv`** (`src/engine/child-env.ts:29–32`): strips all `CYCLE_*` vars from subprocess env. `CYCLE_TRUNK_BASED` set by `loadDotEnv` is stripped for subprocesses, same as when set by `--trunk`; no change needed.

### Test Infrastructure

- **Framework**: Node built-in `node:test` runner; no Jest, Mocha, or Vitest.
- **Assertions**: `node:assert/strict` (imported as `assert` or `{ strict as assert }`).
- **Test location convention**: `tests/engine/<module-name>.test.ts` — new file goes at `tests/engine/dot-env.test.ts`.
- **Filesystem isolation**: real tmpdir via `mkdtemp(join(tmpdir(), "cycle-test-"))` with `rm(root, { recursive: true, force: true })` in `finally`.
- **Process.env isolation**: save/restore pattern in `finally` (see workflow.test.ts pattern above).
- **Current coverage of the change area**: `src/cli.ts` is not in the `FLOORS` table (no per-file floor enforced); `src/engine/workflow.ts` has no per-file floor but is exercised heavily by `tests/engine/workflow.test.ts`. `src/engine/dot-env.ts` (new file) will be added at 100%.

## Code References

- `src/cli.ts:117` — `lockPath` construction: `join(cwd, ".cycle", "engine.lock")` — same pattern for `.env` path
- `src/cli.ts:137` — `if (args.trunk) process.env.CYCLE_TRUNK_BASED = "1";` — insertion point is immediately after
- `src/cli.ts:139` — `const cfg = await loadConfig(cwd);` — `loadDotEnv` must fire before this line
- `src/engine/workflow.ts:46` — `loadConfig` signature with optional `env` param
- `src/engine/workflow.ts:86–88` — `if (env.CYCLE_TRUNK_BASED === "1") commitConfig.mode = "trunk";`
- `src/engine/engine-lock.ts:1` — `import { readFileSync, writeFileSync, unlinkSync } from "node:fs";` — sync fs import pattern
- `src/engine/engine-lock.ts:36–39` — `catch (e) { const err = e as NodeJS.ErrnoException; if (err.code !== "ENOENT") throw e; }` — ENOENT guard pattern
- `scripts/coverage-gate.mjs:12–27` — `FLOORS` table; new entry goes here
- `tests/engine/engine-lock.test.ts:1–3` — test file header pattern for engine utility modules
- `tests/engine/workflow.test.ts:302–332` — `CYCLE_TRUNK_BASED` env-save/restore pattern
- `tests/engine/child-env.test.ts:33–55` — `process.env` mutation + restore with `finally`
- `docs/ENGINE.md:155–171` — commit mode documentation; bootstrap note goes in this section

## Open Questions

- The SPEC says `--trunk` wins "because it sets `process.env.CYCLE_TRUNK_BASED = "1"` at cli.ts:137 before `loadDotEnv` runs at line 138". The SPEC acceptance criteria (line 38) specifies `loadDotEnv` at "line 138" but the current file has no statement at line 138 (it is blank). Confirm whether the SPEC means the call replaces the blank line (making it the new line 138) or is inserted after the current line 138. Either placement satisfies the real-env-wins rule as long as it runs before line 139's `loadConfig`.
- The SPEC calls for `value` trimming (trim after the `=`). Confirm whether leading/trailing whitespace on values should be preserved (i.e., `KEY= value ` → value is `" value "`) or trimmed (→ `"value"`). SPEC says "trimmed" (line 28), but noting this explicitly since environment values with intentional leading spaces would be silently stripped.
