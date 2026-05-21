# Research: Cycle 0232

## Cycle Context

Cycle 0232 closes a branch coverage gap in `src/engine/dot-env.ts`. The `catch` block at line 9 re-throws any error whose `.code` is not `ENOENT`, but that branch has never been exercised by the test suite. Branch coverage is currently 92.31% (12/13 branches hit). The cycle adds a test exercising the non-ENOENT path and optionally wraps the re-thrown error with a user-friendly prefix message while preserving the original `.code` property.

## Current Codebase State

### Relevant Components

- **`src/engine/dot-env.ts`** — `loadDotEnv(filePath)` reads a `.env` file with `readFileSync`. Catches errors; if `err.code !== 'ENOENT'`, re-throws at line 9. If `ENOENT`, returns silently. Parses `KEY=VALUE` lines with real-env-wins precedence (`process.env[key] === undefined` guard). — `src/engine/dot-env.ts:1-23`

- **`tests/engine/dot-env.test.ts`** — 6 tests covering: ENOENT no-op, normal KEY=VALUE, blank lines, comment lines, no-equals lines, real-env-wins, and an integration smoke test with `loadConfig`. Uses `{ test }` from `node:test`, `{ strict as assert }` from `node:assert`, `writeFileSync` from `node:fs`, temp files in `tmpdir()`. No mocks, no chmod. — `tests/engine/dot-env.test.ts:1-115`

- **`docs/ENGINE.md:226`** — Known Limitations note: "`loadDotEnv` swallows only `ENOENT` (missing file). Any other `readFileSync` error — `EACCES`, `EISDIR`, etc. — propagates as an unhandled exception and crashes the engine at bootstrap before any user-facing error handling runs. The test suite does not exercise this path, so the raw Node.js stack trace is the only diagnostic." This note requires updating if a friendly-message wrapper is added.

- **`scripts/coverage-gate.mjs:27`** — `"src/engine/dot-env.ts": 100` floor entry. Enforces 100% **line** coverage only (not branch-specific) against the LCOV file. The branch gap itself is not directly enforced by this script, but achieving 100% branch coverage also satisfies the line floor.

### Existing Patterns to Follow

- **Non-ENOENT error simulation via injected throw** — `tests/engine/stale-dist.test.ts:56-63` creates `Object.assign(new Error("EACCES"), { code: "EACCES" })` and passes it as a throw-injected callback to the function under test. Asserts with `assert.rejects(..., { code: "EACCES" })`.

- **`assert.rejects` for thrown errors** — `stale-dist.test.ts:59-62` uses `assert.rejects(() => fn(), { code: "EACCES" })`. For synchronous throws, the equivalent is `assert.throws(() => fn(), { code: "EACCES" })`.

- **`finally`-based temp file cleanup** — all 6 existing tests in `dot-env.test.ts` use `try/finally` blocks to restore env vars; the pattern is established. Cleanup of temp files (chmod restore + unlink) fits the same pattern.

- **`mock.method` from `node:test`** — `node:test` exports `mock` as a top-level named export (verified: `typeof mock.method === 'function'` on Node 22.22.2). Pattern: `const m = mock.method(fs, "readFileSync", () => { throw err; }); ... m.mock.restore();`. This is the root-guard fallback approach.

- **Object.assign error construction** — `Object.assign(new Error("EACCES"), { code: "EACCES" })` is the established pattern for synthetic `ErrnoException`-like errors across the test suite.

- **`{ test }` import style** — `tests/engine/dot-env.test.ts:1` imports `{ test }` named export. Adding `mock` would extend this to `{ test, mock }`.

### Dependencies & Integration Points

- **`src/engine/dot-env.ts`** imports only `{ readFileSync }` from `node:fs`. The `readFileSync` call at line 6 is the only I/O surface. Mocking `readFileSync` via `mock.method` targets this import directly. — `src/engine/dot-env.ts:1`

- **`tests/engine/dot-env.test.ts`** imports `loadDotEnv` directly from source — `../../src/engine/dot-env.ts`. No intermediary.

- **`docs/ENGINE.md`** — if the friendly-message wrapper lands, the sentence "The test suite does not exercise this path, so the raw Node.js stack trace is the only diagnostic." must be removed or replaced with the new behavior description. — `docs/ENGINE.md:226`

- **`scripts/coverage-gate.mjs`** — enforces the 100% floor after `npm run test:coverage`. Adding the missing branch raises branch coverage from 12/13 to 13/13 (100%). No changes needed to coverage-gate.mjs.

### Test Infrastructure

- **Framework**: Node built-in `node:test` runner. Tests run with `--experimental-strip-types` (no transpile). `{ test }` named import is the standard form in `tests/engine/`.
- **Assertion library**: `node:assert` (`strict as assert` or `assert from "node:assert/strict"`).
- **Mock support**: `mock` named export from `node:test` — `mock.method(object, methodName, impl)` returns a mock object; `m.mock.restore()` reverts. Available on Node 22.22.2.
- **Temp files**: `tmpdir()` from `node:os` + `join()` from `node:path`. Sync write (`writeFileSync`) and async cleanup (`rm` from `node:fs/promises`) both used.
- **Coverage**: `npm run test:coverage` generates `.cycle/coverage.lcov`. `npm run check:coverage` enforces FLOORS table.
- **Current coverage of change area**: `src/engine/dot-env.ts` — Line 100%, Branch 92.31% (12/13), Function 100%. The uncovered branch is `BRDA:9,3,0,0` — the `throw e` path at line 9 when `err.code !== 'ENOENT'`.

## Code References

- `src/engine/dot-env.ts:6` — `readFileSync(filePath, "utf8")` — the only I/O call; mock target for root-guard path
- `src/engine/dot-env.ts:9` — `if (err.code !== "ENOENT") throw e;` — the uncovered branch (throw side has 0 hits per LCOV `BRDA:9,3,0,0`)
- `tests/engine/dot-env.test.ts:1` — `import { test } from "node:test"` — extend to `{ test, mock }` for root-guard approach
- `tests/engine/dot-env.test.ts:3-4` — current fs imports: `{ mkdtemp, mkdir, writeFile, rm }` async + `{ writeFileSync }` sync; `chmodSync` would be added here for chmod approach
- `tests/engine/stale-dist.test.ts:56-63` — reference pattern for non-ENOENT error propagation test using `Object.assign(new Error("EACCES"), { code: "EACCES" })` + `assert.rejects`
- `docs/ENGINE.md:226` — Known Limitations paragraph for `loadDotEnv` — update target if friendly-message wrapper is added
- `scripts/coverage-gate.mjs:27` — `"src/engine/dot-env.ts": 100` floor — no change needed

## Open Questions

- **chmod vs mock approach**: The SPEC lists two approaches: (1) `chmodSync(filePath, 0o000)` on a real temp file with root guard, and (2) `mock.method(fs, "readFileSync", ...)` as the root-guard fallback. The planner must decide whether to use the chmod approach (primary, closer to real behavior) or the mock approach (simpler, platform-independent, no root concern). The chmod approach is verified to work on the current platform (uid 501); `chmodSync` is available in `node:fs`. The mock approach avoids the root-guard branch entirely.
- **Friendly-message wrapper**: SPEC marks this optional. The planner must decide whether to implement it. The decision affects whether `docs/ENGINE.md:226` is updated and whether `src/engine/dot-env.ts` is modified beyond adding a test. If implemented, the wrapper must produce an `Error` with the original `.code` intact.
- **`assert.throws` vs `assert.rejects`**: `loadDotEnv` is synchronous — `assert.throws` is the correct assertion (not `assert.rejects`). The stale-dist analog used `assert.rejects` because `emitStaleDistWarning` is async.
