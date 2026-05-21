# Research: Cycle 0244

## Cycle Context

Cycle 0244 adds a single log event to the `catch` block of `parkForDiscussion` in `src/engine/triage.ts`. Currently when `rename(raw.srcPath, destPath)` throws, the function silently sets `renamed = false` and returns — no record appears in the log stream. The fix emits `log.emit('issue.park_failed', { id: raw.id, error: String(e) })` before returning, with no change to control flow. A unit test must stub `rename` to throw, call `parkForDiscussion` indirectly via `runTriage`, assert exactly one `issue.park_failed` event with correct `id` and `error` payload, and assert no such event fires on the happy path.

## Current Codebase State

### Relevant Components

- **`parkForDiscussion` function**: `src/engine/triage.ts:708–729` — async function, signature `(repoRoot: string, raw: RawIssue, log: Logger): Promise<void>`. Creates `docs/cycle/issues/discuss/` via `mkdir`, sets `let renamed = true`, calls `await rename(raw.srcPath, destPath)` inside a `try` block. The `catch` block at line 719–721 sets `renamed = false` with no other action. After the try/catch, if `renamed` is true, emits `issue.parked_for_discussion` with `{ id, priority: "discuss", path: destPath }` — line 723–728.

- **`rename` import**: `src/engine/triage.ts:2` — imported from `node:fs/promises` via destructured named import: `import { readFile, writeFile, readdir, mkdir, rename, unlink } from "node:fs/promises"`.

- **`runTriage` discuss guard**: `src/engine/triage.ts:192–197` — the main `runTriage` loop iterates `raws`, checks `if (raw.fm.priority === "discuss")`, calls `await parkForDiscussion(repoRoot, raw, log)`, then `continue`. This is the only call site of `parkForDiscussion`.

- **`RawIssue` type**: `src/engine/triage.ts:59–65` — `{ id: string; body: string; fm: Frontmatter; srcPath: string; attempts: number }`. The `id` field is used as the event payload `id`; `srcPath` is the path passed to `rename`.

- **`Logger` type**: `src/engine/log.ts:4–6` — `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }`. The `createLogger` implementation appends JSON lines to `.cycle/log.jsonl`. In tests, a capturing stub is used.

- **Existing success-path event**: `src/engine/triage.ts:723–728` — `await log.emit("issue.parked_for_discussion", { id: raw.id, priority: "discuss", path: destPath })` is emitted only when `renamed === true`. The failure-path event (`issue.park_failed`) is entirely absent.

- **`dryRunTriage` discuss guard**: `src/engine/triage.ts:300` — `if (raw.fm.priority === "discuss") continue;` — silently skips; does not call `parkForDiscussion`. Not relevant to this cycle.

### Existing Patterns to Follow

- **Capturing log pattern**: All triage test files use a `makeLog()` / `makeLogCapturing()` helper that returns `{ log: Logger; events: Captured[] }` where `Captured = { event: string; fields: Record<string, unknown> }`. See `tests/engine/triage.test.ts:39–47`, `tests/engine/triage.faults.test.ts:41–49`, `tests/engine/triage-priority.test.ts:44–52`.

- **Cardinality-pinned event assertions**: Per CLAUDE.md and established convention, use `events.filter(e => e.event === 'issue.park_failed').length === 1` (not `find`). Example at `tests/engine/triage-priority.test.ts:194–196`: `const parked = events.filter((e) => e.event === "issue.parked_for_discussion"); assert.equal(parked.length, 1, "exactly one parked event");`.

- **`mock.method` on `node:fs` (CJS module)**: The only existing use of `mock.method` in the test suite is in `tests/engine/dot-env.test.ts:103`: `const m = mock.method(nodefs, "readFileSync", () => { throw fakeErr; });` with `import * as nodefs from "node:fs"` at line 5, then `m.mock.restore()` in a `finally` block. CLAUDE.md explicitly states `node:fs/promises` cannot be stubbed via `mock.method` (ESM module properties are non-configurable); use `node:fs` (CJS) instead.

- **`rawBody` helper for discuss raws**: `tests/engine/triage-priority.test.ts:69–81` — helper accepts optional `priority?: string` parameter and conditionally pushes the `priority:` frontmatter line. The discuss tests pass `"discuss"` as priority.

- **`setupRepo` pattern**: All triage test files use a `setupRepo()` helper that creates a temp directory with `.cycle/prompts/`, `docs/cycle/issues/raw/`, `todo/`, `done/`, `failed/`, and the triage prompt template. The discuss/ subdirectory is not pre-created — `parkForDiscussion` creates it via `mkdir({ recursive: true })`.

- **`try/finally` cleanup**: All triage tests wrap in `try { ... } finally { await rm(root, { recursive: true, force: true }); }`.

### Dependencies & Integration Points

- **`rename` in `parkForDiscussion` comes from `node:fs/promises`**: `src/engine/triage.ts:2`. To stub it via `mock.method`, the test must intercept `node:fs` (the CJS module), not `node:fs/promises`. The function name in `node:fs` is `rename` (callback-style). However, `triage.ts` imports directly from `node:fs/promises` as a destructured binding. This means `mock.method` on `node:fs` would not intercept the `rename` used inside `triage.ts` — the binding in the module is captured at import time.

- **Alternative injection approach for `rename`**: The existing fault tests in `triage.faults.test.ts` trigger `rename` failures without `mock.method` — they use filesystem state manipulation (e.g., `chmod 0o500` on the target directory, pre-creating `.tmp` paths as directories). To make `rename(raw.srcPath, destPath)` throw in `parkForDiscussion`, the simplest real-filesystem approach is to `chmod 0o000` or `chmod 0o500` on `docs/cycle/issues/raw/` after writing the raw file, or to make `destPath` unreachable. The most reliable approach consistent with existing fault tests is to make the discuss/ target directory path itself unwritable (pre-create `docs/cycle/issues/discuss` as a file, not a directory, so `mkdir` succeeds but `rename` into it fails with ENOTDIR).

- **SPEC.md says**: use `mock.method` on `node:fs`. The SPEC's testing strategy section cites CLAUDE.md convention. The planner must reconcile SPEC intent with the architectural constraint that `triage.ts` imports `rename` from `node:fs/promises`, not `node:fs`. The `mock.method` technique works for modules that look up properties at call time (CJS), not for modules with ESM destructured bindings captured at import time.

- **Coverage floor**: `src/engine/triage.ts` has a per-file floor of 95% (CLAUDE.md coverage policy, enforced by `scripts/coverage-gate.mjs`). The `catch` block at line 719–721 is currently a dead branch in tests (no test makes `rename` throw inside `parkForDiscussion`). Adding the event emission and a test that reaches it closes this coverage gap.

### Test Infrastructure

- **Framework**: `node:test` with `node:assert/strict`. No external test libraries.
- **Directory layout**: `tests/engine/triage*.test.ts` — five files currently covering triage.
- **Test for `parkForDiscussion`**: `tests/engine/triage-priority.test.ts:163–211` is the primary test for the success path of `parkForDiscussion` (rename succeeds, event emitted, file moved). No test currently covers the failure path.
- **Event capture**: `Captured = { event: string; fields: Record<string, unknown> }` with async `makeLog()` / `makeLogCapturing()` helpers returning both `log` and `events` array.
- **Mock restore pattern**: `mock.method` returns a mock object; `m.mock.restore()` in a `finally` block is the cleanup convention (see `tests/engine/dot-env.test.ts:115`).
- **`mock` import**: `import { test, mock } from "node:test"` — `mock` is a named export from `node:test`, not a separate import.
- **Current coverage of change area**: The `catch` block of `parkForDiscussion` (lines 719–721) has zero test coverage. The success path (lines 716–728) is covered by `tests/engine/triage-priority.test.ts`.

## Code References

- `src/engine/triage.ts:2` — `rename` imported from `node:fs/promises` (destructured binding, not interceptable via `mock.method` on CJS `node:fs`)
- `src/engine/triage.ts:59–65` — `RawIssue` type: `{ id, body, fm, srcPath, attempts }`
- `src/engine/triage.ts:192–197` — `runTriage` discuss guard: only call site of `parkForDiscussion`
- `src/engine/triage.ts:708–729` — `parkForDiscussion` full implementation; `catch` block at 719–721 is the change target
- `src/engine/triage.ts:723–728` — existing `issue.parked_for_discussion` emit (success path)
- `src/engine/log.ts:4–6` — `Logger` type: `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }`
- `tests/engine/triage-priority.test.ts:44–52` — `makeLogCapturing()` helper (canonical form)
- `tests/engine/triage-priority.test.ts:69–81` — `rawBody` helper with optional `priority` param
- `tests/engine/triage-priority.test.ts:163–211` — existing success-path test for `parkForDiscussion`
- `tests/engine/triage.faults.test.ts:41–49` — fault-test `makeLog()` helper
- `tests/engine/triage.faults.test.ts:545–592` — `chmod 0o500` on target dir to force rename failure (pattern reusable for discuss/ target)
- `tests/engine/dot-env.test.ts:1–6` — `mock.method` import pattern: `import { test, mock } from "node:test"` + `import * as nodefs from "node:fs"`
- `tests/engine/dot-env.test.ts:103–116` — only existing `mock.method` usage: intercepts `nodefs.readFileSync`, restores in `finally`

## Open Questions

1. **`mock.method` vs filesystem injection for `rename`**: SPEC.md says to use `mock.method` on `node:fs`. However, `triage.ts` imports `rename` from `node:fs/promises` as a destructured binding captured at module load time — `mock.method` on `node:fs` does not intercept it. The planner must decide: (a) use a real-filesystem trick to make `rename` fail (e.g., pre-create the `discuss/` target as a file so `rename` into it fails with ENOTDIR), consistent with `triage.faults.test.ts` patterns; or (b) refactor `triage.ts` to look up `rename` through an injectable or lazily-resolved reference. Option (a) requires no source change; option (b) requires a source refactor outside the SPEC's stated scope.

2. **Which test file to add to**: The new tests could go in `tests/engine/triage-priority.test.ts` (where the success-path `parkForDiscussion` tests live) or `tests/engine/triage.faults.test.ts` (where fault-injection tests live). The failure-path test is semantically a fault test; the planner should decide file placement.

3. **Error variable binding in catch**: The current catch block at line 719 is `catch {` (no binding). To call `String(e)`, it must become `catch (e) {`. This is the only source change required beyond adding `await log.emit(...)`.
