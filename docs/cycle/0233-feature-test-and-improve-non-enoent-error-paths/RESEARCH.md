# Research: Cycle 0233

## Cycle Context

Cycle 0233 targets `bootstrapArchiveIfLegacy` in `src/engine/queue.ts` (lines 125–152). The function runs at engine startup to detect and archive legacy `tbd.jsonl` files. Its `rename` call at line 150 currently has no `try/catch`, so a non-ENOENT error (e.g., `EACCES`, `ENOSPC`) rethrows opaquely with no context message. The cycle adds a `try/catch` around line 150 that rethrows with `bootstrapArchiveIfLegacy: rename failed: ${err.message}` (preserving `.code`), and adds a `mock.method`-based test in `tests/engine/queue.test.ts` that injects an `EACCES` error on `rename` and asserts the wrapped message.

## Current Codebase State

### Relevant Components

- **`bootstrapArchiveIfLegacy`**: exported async function — `src/engine/queue.ts:125–152`
  - Reads `tbd.jsonl` at line 129; ENOENT → return false (line 131–132); non-ENOENT rethrows bare at line 133 (no wrapper).
  - Iterates lines looking for legacy-shape rows (line 135–147).
  - `hasLegacy === false` → return false (line 148).
  - Calls `pickArchivePath(repoRoot)` at line 149 to find an unused archive path.
  - Calls `await rename(path, archive)` at line 150 — **bare, unwrapped**. A non-ENOENT failure here propagates as the original `Error` object with no function context.
  - Returns `true` at line 151.
- **`rename` import**: imported at file top — `src/engine/queue.ts:1` — `import { readFile, writeFile, rename, appendFile, mkdir, stat } from "node:fs/promises"`.
- **`pickArchivePath`**: helper at `src/engine/queue.ts:107–123`. Uses `stat` to probe for existing archive paths; throws `new Error("too many bootstrap archives")` at line 122 if 1000 slots exhausted (already tested indirectly).
- **`dot-env.ts` reference implementation** (analogous pattern): `src/engine/dot-env.ts:7–15` — wraps `readFileSync` in a `try/catch`, checks `err.code !== "ENOENT"`, rethrows via `Object.assign(new Error(\`Cannot read .env file at ${filePath}: ${err.message}\`), { code: err.code })`.

### Existing Patterns to Follow

- **`Object.assign` error wrapping**: non-ENOENT errors are wrapped with `Object.assign(new Error(\`<context>: <original message>\`), { code: err.code })` — `src/engine/dot-env.ts:10–13`. This preserves the original `.code` on the new error.
- **`mock.method` for fs error injection**: `tests/engine/dot-env.test.ts:103` — `mock.method(nodefs, "readFileSync", () => { throw fakeErr; })` where `nodefs` is imported as `import * as nodefs from "node:fs"`. The spec requires the same pattern targeting `node:fs/promises` instead of `node:fs`.
- **Mock restore in `finally`**: `tests/engine/dot-env.test.ts:114` — `m.mock.restore()` called in a `finally` block.
- **`assert.rejects` for async rejections**: existing queue tests use `await assert.rejects(() => fn(), /pattern/)` at `tests/engine/queue.test.ts:218–221`, `tests/engine/queue.test.ts:246`. The new test should use this form.
- **`setupRoot` helper**: `tests/engine/queue.test.ts:22–26` — creates a temp dir with `.cycle/` subdir. Used by all bootstrapArchiveIfLegacy tests (lines 98–157).
- **Legacy seed string**: existing tests seed with `JSON.stringify({ id: "OLD", source: "text", title: "t", path: "/p", added_at: "y" }) + "\n"` to reach the rename path — `tests/engine/queue.test.ts:101–103`.
- **`try/finally` for temp dir cleanup**: all queue tests use `try { ... } finally { await rm(root, { recursive: true, force: true }); }` — standard in the test file.

### Dependencies & Integration Points

- **`node:fs/promises` ESM binding**: `src/engine/queue.ts:1` imports `rename` destructured from `"node:fs/promises"`. To stub via `mock.method`, the test must import `* as nodeFsPromises from "node:fs/promises"` and stub `nodeFsPromises.rename`. This mirrors how `dot-env.test.ts` imports `* as nodefs from "node:fs"` (line 5) to stub `readFileSync`. The ESM live-binding interception technique is confirmed working in this repo.
- **`node:test` mock API**: `mock` imported from `"node:test"` — `tests/engine/dot-env.test.ts:1`. The `mock.method` API is available since Node 20; confirmed working in this project (cycle 0232).
- **`bootstrapArchiveIfLegacy` call site**: called once at engine startup in `src/engine/run-cycle.ts` — verifiable via grep. Any thrown error propagates as an unhandled startup failure.
- **`pickArchivePath` must succeed before `rename`**: the test must ensure `.cycle/tbd.jsonl.bootstrap-archive` does not already exist so `pickArchivePath` returns the base path without error, allowing execution to reach the `rename` call.

### Test Infrastructure

- **Framework**: `node:test` (built-in), no external test library — `tests/engine/queue.test.ts:1`.
- **Assertions**: `node:assert/strict` — `tests/engine/queue.test.ts:2`.
- **Mocking**: `mock` from `"node:test"` — `tests/engine/dot-env.test.ts:1`. The queue test file does not currently import `mock`; it will need to be added.
- **Imports needed**: `tests/engine/queue.test.ts:1–20` — current imports do not include `mock` from `"node:test"` or `* as nodeFsPromises from "node:fs/promises"`. Both must be added.
- **Test file location**: `tests/engine/queue.test.ts` — all queue tests live here.
- **Coverage floor**: `src/engine/queue.ts` is listed in CLAUDE.md per-file floors at **90%**; enforced by `scripts/coverage-gate.mjs`.
- **Current coverage** (from `.cycle/coverage.lcov`):
  - Lines: 205 hit / 210 total = **97.6%**
  - Branches: 103 hit / 114 total = **90.4%** — currently at floor; untested branches identified below.
  - Functions: 22/22 = 100%.

### Uncovered Lines and Branches in `bootstrapArchiveIfLegacy`

From LCOV data:

| Line | Hit count | Notes |
|------|-----------|-------|
| `132` | 0 | non-ENOENT rethrow after `readFile` failure |
| `133` | 0 | non-ENOENT rethrow after `readFile` failure |
| `141` | 0 | `JSON.parse` `catch` block continuation |
| `142` | 0 | `JSON.parse` `catch` block continuation |

Line 150 (`await rename(path, archive)`) is hit 3 times — it executes but the error path is never taken. There is no `try/catch` around it, so the non-ENOENT failure branch is structurally absent (nothing to cover yet). Adding the `try/catch` introduces a new branch (ENOENT check + rethrow) that the new test must cover.

BRDA entries `131,86,0,0` and `135,87,0,8` confirm branch index 86 at line 131 (non-ENOENT path after `readFile`) has 0 executions.

## Code References

- `src/engine/queue.ts:1` — imports `rename` from `"node:fs/promises"` (destructured).
- `src/engine/queue.ts:125–152` — `bootstrapArchiveIfLegacy` full body.
- `src/engine/queue.ts:129–133` — `readFile` try/catch; ENOENT path tested; non-ENOENT rethrow at lines 132–133 uncovered.
- `src/engine/queue.ts:150` — bare `await rename(path, archive)` — target for `try/catch` wrapping.
- `src/engine/dot-env.ts:7–15` — reference implementation for `Object.assign`-based error wrapping pattern.
- `tests/engine/dot-env.test.ts:1` — `import { test, mock } from "node:test"` — `mock` import pattern.
- `tests/engine/dot-env.test.ts:5` — `import * as nodefs from "node:fs"` — namespace import for `mock.method` targeting.
- `tests/engine/dot-env.test.ts:99–137` — full non-ENOENT test case with `mock.method`, assertion on `.code` and `.message`, and `finally` restore.
- `tests/engine/queue.test.ts:1` — current imports: `test` from `"node:test"` (no `mock`); must add `mock`.
- `tests/engine/queue.test.ts:98–157` — existing `bootstrapArchiveIfLegacy` tests; new test appends here.
- `tests/engine/queue.test.ts:22–26` — `setupRoot` helper.
- `docs/ENGINE.md:40` — mentions bootstrap-archive behavior; no Known Limitation note for non-ENOENT rename errors (none to retire).

## Open Questions

- The SPEC targets wrapping only the `rename` call (line 150). Lines 132–133 (non-ENOENT `readFile` rethrow) are also uncovered per LCOV but are explicitly out of scope per SPEC §Out of Scope. The planner should confirm the 90% branch floor still passes after adding only the `rename` wrapper and its test, without also covering lines 132–133. Current branch coverage is 90.4% (103/114); adding the `rename` `try/catch` introduces new branches — the planner must verify the net coverage after the change stays at or above 90%.
- The SPEC states the test should import `* as nodeFsPromises from "node:fs/promises"` and stub `nodeFsPromises.rename`. It should be confirmed that ESM live-binding interception works for async `rename` from `"node:fs/promises"` in the same way it works for synchronous `readFileSync` from `"node:fs"` (both confirmed via cycle 0232 research, but `node:fs/promises` was not directly tested for mock.method compatibility).
