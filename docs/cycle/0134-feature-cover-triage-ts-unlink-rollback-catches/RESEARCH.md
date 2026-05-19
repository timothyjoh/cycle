I have all the information needed. Writing the research document.

```markdown
# Research: Cycle 0134

## Cycle Context

Cycle 0134 closes the final two uncovered lines in `src/engine/triage.ts` by adding `unlink` fault-injection to `TriageDeps` and writing two tests in `tests/engine/triage.faults.test.ts` — one for the `applyRaw` rollback unlink catch (exercised when `rename(raw→done/)` fails and the best-effort `unlink(todoPath)` also fails) and one for the `atomicWrite` tmp-cleanup catch (exercised when `rename(tmp→path)` fails and the best-effort `unlink(tmp)` also fails). The DI convention was established in cycle 0133 via the `runAgent?` field on `TriageDeps`.

## Current Codebase State

### Relevant Components

- **`TriageDeps` type** — `src/engine/triage.ts:30-32`
  ```ts
  export type TriageDeps = {
    runAgent?: TriageAgentRunner;
  };
  ```
  Only has `runAgent?`. Needs `unlink?` field added.

- **Top-level `unlink` import** — `src/engine/triage.ts:2`
  ```ts
  import { readFile, writeFile, readdir, mkdir, rename, unlink } from "node:fs/promises";
  ```
  Both `applyRaw` and `atomicWrite` call the module-level `unlink` directly; they receive no `deps` parameter today.

- **`applyRaw` function** — `src/engine/triage.ts:580-648`
  - Signature: `async function applyRaw(repoRoot: string, raw: RawIssue, parsed: TriageOutput): Promise<void>`
  - Called from `runTriage` via closure at line 198: `apply: (r, parsed) => applyRaw(repoRoot, r, parsed)`
  - Rollback catch block at lines 628-647. Inner unlink try/catch at lines 630-634:
    ```ts
    try {
      await unlink(todo);   // line 631 — target DA line
    } catch {
      // best-effort         // line 633 — uncovered
    }
    ```
  - After the unlink rollback, code continues with writeQueue rollback (lines 636-645) and re-throws `e`.

- **`atomicWrite` function** — `src/engine/triage.ts:650-664`
  - Signature: `async function atomicWrite(path: string, content: string): Promise<void>`
  - Called from `applyRaw` at line 609: `await atomicWrite(todoPath, todoContent);`
  - Cleanup catch block at lines 654-662. Inner unlink try/catch at lines 657-661:
    ```ts
    try {
      await unlink(tmp);        // line 658 — target DA line
    } catch {
      // best-effort cleanup    // line 660 — uncovered
    }
    ```
  - After the inner catch, re-throws the original rename error `e`.

- **`runTriage` function** — `src/engine/triage.ts:156-265`
  - Receives `deps: TriageDeps = {}` at line 160
  - Resolves `runAgent`: `const runAgent = deps.runAgent ?? runAgentViaDispatch;` at line 162
  - Calls `applyRaw` via `ctx.apply` closure at line 198 — this is where threading of `deps.unlink` must be introduced

- **`dryRunTriage` function** — `src/engine/triage.ts:267-324`
  - Signature takes `deps: TriageDeps = {}`; passes `runAgent` through but does not call `apply` (no `applyRaw` invocation in dry-run path)
  - Not affected by this cycle

### Existing Patterns to Follow

- **`TriageDeps` optional field DI pattern** — established cycle 0133 at `src/engine/triage.ts:30-32`; optional field with `??` fallback to production default (`deps.runAgent ?? runAgentViaDispatch`). New `unlink` field follows exact same shape: `unlink?: (path: string) => Promise<void>`.

- **Test: passing `deps` to `runTriage`** — all fault tests pass `deps: TriageDeps` as 4th arg to `runTriage`; see `triage.faults.test.ts:100,106,154,204,231,276,282,345,566,569`.

- **Test helpers already defined in `triage.faults.test.ts`**:
  - `setupRepo()` — line 51; creates all required dirs including `.cycle/prompts/`, `raw/`, `todo/`, `done/`, `failed/`; writes prompt template
  - `makeConfig()` — line 25; returns a valid `CycleConfig`
  - `makeLog()` — line 41; returns `{ log: Logger, events: Captured[] }`
  - `rawBody(id, title, attempts)` — line 66; produces frontmatter-prefixed raw file content
  - `enrichJson(rawId)` — line 527; produces a single-child `ordering:[rawId]` agent output for the given raw ID
  - `exists(path)` — line 81; `stat`-based boolean helper
  - `Captured` type — line 39

- **Triggering the `applyRaw` rollback path** — existing pattern in Test 7 (`triage.faults.test.ts:545`): `await chmod(join(root, "docs/cycle/issues/done"), 0o500)` makes `rename(raw → done/)` fail with EACCES, entering the catch/rollback block. Cleanup in `finally` restores perms.

- **Triggering `atomicWrite` rename failure** — inject fault by pre-creating `path.tmp` as a non-empty directory (EISDIR), used in Test 5 (`triage.faults.test.ts:341`). This blocks `rename(tmp, path)` with EISDIR.

### Dependencies & Integration Points

- **`applyRaw` ← `runTriage`** — private function called via `ctx.apply` closure; to thread `deps.unlink`, the closure at line 198 must be updated to pass the injectable
- **`atomicWrite` ← `applyRaw`** — also private; call at line 609 must forward the injectable
- **`unlink` import** — currently module-level; the injectable only replaces the calls inside the two catch blocks, not all calls to `unlink` in the file (e.g., `runAgentViaDispatch` at line 745 uses `unlink` directly and is unrelated)
- **`writeQueue` / `appendRow`** — `src/engine/queue.ts`; called inside `applyRaw` rollback. Not changed by this cycle but must remain functional in tests for queue-state assertions.

### Test Infrastructure

- **Test framework**: `node:test` + `node:assert` (strict); no external test runner
- **Test file**: `tests/engine/triage.faults.test.ts` — 8 existing tests (Tests 1, 2, 3, 4, 5, 6a, 6b, 6c, 6d, 7); new tests append here as Tests 8 and 9 (or similar labels matching the comment pattern)
- **Fixture pattern**: `mkdtemp` → `setupRepo()` → write raw files → run → `rm(root, {recursive:true})` in `finally`
- **Injection pattern**: construct `deps: TriageDeps = { runAgent: ..., unlink: ... }` and pass to `runTriage`
- **Coverage of change area**: `src/engine/triage.ts` currently at 99.72% line coverage; the 4 lines in the two inner catch blocks are the only uncovered lines. Per-file floor is 95% (no change needed to `scripts/coverage-gate.mjs`).

## Code References

- `src/engine/triage.ts:2` — `unlink` import from `node:fs/promises`
- `src/engine/triage.ts:30-32` — `TriageDeps` type definition (add `unlink?` here)
- `src/engine/triage.ts:160,162` — `runTriage` receives and resolves `deps`; `deps.unlink` resolution follows same `??` pattern
- `src/engine/triage.ts:198` — `apply` closure — where `deps.unlink` must be threaded into `applyRaw`
- `src/engine/triage.ts:580` — `applyRaw` signature (no `deps` today; must gain access to injected `unlink`)
- `src/engine/triage.ts:609` — `atomicWrite(todoPath, todoContent)` call inside `applyRaw`
- `src/engine/triage.ts:628-647` — `applyRaw` outer catch block; lines 630-634 contain the uncovered inner catch
- `src/engine/triage.ts:631` — `await unlink(todo)` — target for injection
- `src/engine/triage.ts:650` — `atomicWrite` signature (no `deps` today)
- `src/engine/triage.ts:654-662` — `atomicWrite` outer catch; lines 657-661 contain the uncovered inner catch
- `src/engine/triage.ts:658` — `await unlink(tmp)` — target for injection
- `tests/engine/triage.faults.test.ts:51-64` — `setupRepo()` helper
- `tests/engine/triage.faults.test.ts:25-37` — `makeConfig()` helper
- `tests/engine/triage.faults.test.ts:41-49` — `makeLog()` helper
- `tests/engine/triage.faults.test.ts:527-543` — `enrichJson(rawId)` helper
- `tests/engine/triage.faults.test.ts:545-592` — Test 7 (rollback writeQueue catch) — closest structural analog to the new tests
- `scripts/coverage-gate.mjs:12-18` — `FLOORS` table; `src/engine/triage.ts` floor is 95%; no changes required

## Open Questions

1. **Threading approach for `applyRaw` and `atomicWrite`**: The planner must choose how to pass the injected `unlink` into the two private functions. Three options:
   - **A. Extend `applyRaw` signature**: add `unlinkFn: (path: string) => Promise<void>` as 4th param, pass it into `atomicWrite` as 3rd param; update the `apply` closure in `runTriage` to supply `deps.unlink ?? unlink`.
   - **B. Pass full `deps`**: add `deps: TriageDeps` as 4th param to `applyRaw` and as 3rd param to `atomicWrite`; consistent with `runTriage`'s own pattern but gives private functions access to more than they need.
   - **C. Closure at call site**: inside `runTriage`, capture `const unlinkFn = deps.unlink ?? unlink` and close over it in the `apply` callback, forwarding it to `applyRaw`.

2. **Scope of injection in `atomicWrite`**: `atomicWrite` is also called transitively during `applyRaw`'s success path. The injected `unlink` must only fire in the catch block. The natural solution (replacing `unlink` call in the catch with the injectable) achieves this automatically, but the planner should confirm no unintended side effects on the success path.

3. **Test scenario for `applyRaw` rollback**: triggering the catch requires the outer `rename(raw.srcPath → done/)` to fail. `chmod(done/, 0o500)` is the established pattern (Test 7). The injected `unlink` must throw for any call (or specifically for the `todoPath` call). The test must then assert the original rename error propagates (not the swallowed unlink error).

4. **Test scenario for `atomicWrite` cleanup**: triggering the catch requires `rename(tmp, path)` to fail. The EISDIR-directory trick (Test 5) works. The injected `unlink` must throw. The test must then assert the ORIGINAL rename error propagates unchanged — not the unlink error.

5. **`dryRunTriage` is unaffected**: it calls `processRawWithRetry` without `ctx.apply`, so `applyRaw` is never invoked on the dry-run path. No changes or tests needed for `dryRunTriage`.
```
