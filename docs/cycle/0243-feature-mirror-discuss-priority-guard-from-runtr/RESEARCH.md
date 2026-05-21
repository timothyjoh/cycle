# Research: Cycle 0243

## Cycle Context

`dryRunTriage` in `src/engine/triage.ts` invokes `processRawWithRetry` for every raw file, including those whose frontmatter has `priority: discuss`. The live `runTriage` has an explicit guard at line 194–197 that calls `parkForDiscussion` and `continue`s before the agent call for discuss raws. This divergence makes `cycle triage --dry-run` output misleading — operators see agent invocations that would never occur on the next live run. The cycle adds a matching `if (raw.fm.priority === 'discuss') { continue; }` guard in `dryRunTriage` and covers it with two new tests in `tests/engine/triage-dry-run.test.ts`.

## Current Codebase State

### Relevant Components

- **`runTriage` discuss guard**: Lines 194–197 in `src/engine/triage.ts` — the guard that this cycle mirrors. Inside the `for (const raw of raws)` loop, before `processRawWithRetry`:
  ```ts
  if (raw.fm.priority === "discuss") {
    await parkForDiscussion(repoRoot, raw, log);
    continue;
  }
  ```
- **`dryRunTriage` function**: Lines 274–331 in `src/engine/triage.ts` — exported async function, no discuss guard present. The `for (const raw of raws)` loop starts at line 299; `processRawWithRetry` is called unconditionally at line 303 with `{ ...raw, attempts: 0 }`.
- **`dryRunTriage` for-loop (insertion point)**: Lines 299–329 in `src/engine/triage.ts`. The guard must be inserted between line 299 (`for (const raw of raws) {`) and line 302 (`const outcome = await processRawWithRetry(`). There is one comment block at lines 300–302 before the `processRawWithRetry` call; the guard goes after the opening brace of the `for` and before that comment.
- **`parkForDiscussion`**: Lines 707–728 in `src/engine/triage.ts` — private async function. Requires `repoRoot`, `raw`, and `log: Logger`. `dryRunTriage` has a `silentLog` at line 281; per SPEC, the dry-run skip is silent (`continue` only, no `parkForDiscussion` call, no side effects).
- **`loadRaws`**: Lines 333–359 in `src/engine/triage.ts` — parses frontmatter for each `.md` file in `raw/`; populates `raw.fm` including `priority` field. The `priority` field is read from frontmatter and stored as-is on `fm`.
- **`RawIssue` type**: Lines 59–65 in `src/engine/triage.ts` — `fm: Frontmatter` field carries all frontmatter values including `priority`.
- **`Priority` type**: Line 6 in `src/engine/queue.ts` — `"low" | "medium" | "high" | "critical" | "discuss"`. The `"discuss"` literal is a valid member of the union.
- **`normalizePriority`**: Lines 12–21 in `src/engine/queue.ts` — called by `applyRaw` when writing todo files; not involved in `dryRunTriage`.
- **ENGINE.md known limitation note**: Line 21 in `docs/ENGINE.md` — explicitly documents this divergence as a known limitation and describes the exact fix. After the change, this line must be updated to remove the limitation notice.

### Existing Patterns to Follow

- **`runTriage` discuss guard idiom**: `if (raw.fm.priority === "discuss") { ... continue; }` — the SPEC requires the dry-run guard to be a silent `continue` with no `parkForDiscussion` call (dry-run produces no side effects).
- **`dryRunTriage` test structure** (`tests/engine/triage-dry-run.test.ts`): Each test calls `setupRepo()` to build a temp directory, writes raw `.md` files via `rawBody(id, title, attempts?)`, constructs a `TriageDeps` stub with `runAgent` that either counts calls or returns controlled output, then calls `dryRunTriage(root, makeConfig(), deps)` and asserts on the returned `DryRunReport[]`. Every test wraps in `try/finally { rm(root, ...) }`.
- **`rawBody` in `triage-dry-run.test.ts`**: Line 53 — signature `rawBody(id, title, attempts = 0)`, does not accept a `priority` field. New tests for discuss raws need to serialize frontmatter with a `priority: discuss` line manually or use a modified helper.
- **`rawBody` in `triage-priority.test.ts`**: Line 69 — signature `rawBody(id, title, priority?: string)`, conditionally appends `priority: ${priority}` to the frontmatter. New tests in `triage-dry-run.test.ts` should either inline the frontmatter or add a matching optional `priority` parameter to the local `rawBody` helper.
- **Agent call counting pattern**: Multiple tests in `triage-dry-run.test.ts` use a `calls` counter incremented inside `runAgent` (e.g., lines 165, 351, 484) and assert `assert.equal(calls, N)`.
- **Byte-identity assertion pattern**: The "dryRun byte-identity" test (line 234) uses `dirHash` and `fileBytes` to assert no filesystem mutation. Discuss-skip tests need no such assertion because the SPEC confirms the skip is a pure `continue` with no file I/O.

### Dependencies & Integration Points

- **`src/engine/triage.ts`** exports `dryRunTriage`, `runTriage`, `TriageDeps`, `DryRunReport`, `validateOutput` — `tests/engine/triage-dry-run.test.ts` imports `dryRunTriage` and `TriageDeps` from this file (line 17–20).
- **`src/engine/workflow.ts`** — `CycleConfig` type; `makeConfig()` in both test files returns a hardcoded config with `workflows: [{ name: "feature", ... }]`.
- **`src/engine/frontmatter.ts`** — `parseFrontmatter` used by `loadRaws`; `Frontmatter` type carries the raw `priority` string; no type-level enforcement of the `Priority` union on the `fm` object (it's typed as `Frontmatter`, which uses `Record<string, unknown>` internally).
- **`src/engine/queue.ts`** — `Priority` union type; not directly referenced by `dryRunTriage` (no `normalizePriority` call in that path).
- **`docs/ENGINE.md`** — documents the known limitation at line 21; must be updated after the change.

### Test Infrastructure

- **Test framework**: `node:test` with `node:assert/strict` — consistent across all triage test files.
- **Test file for new tests**: `tests/engine/triage-dry-run.test.ts` — the SPEC explicitly names this file. It currently has 11 tests (lines 125–562).
- **`setupRepo()` helper** (`triage-dry-run.test.ts:38`): Creates a temp directory tree with `.cycle/prompts/triage.md`, `docs/cycle/issues/{raw,todo,done,failed}/`. New tests call this helper unchanged.
- **`makeConfig()` helper** (`triage-dry-run.test.ts:24`): Returns a minimal `CycleConfig` with one `feature` workflow. New tests call this unchanged.
- **`rawBody` helper** (`triage-dry-run.test.ts:53`): Does not accept a `priority` parameter. New discuss tests must either extend this helper signature or write inline frontmatter strings. The analogous helper in `triage-priority.test.ts:69` shows the pattern for adding an optional `priority` argument.
- **`TriageDeps` stub pattern**: `runAgent` is the only field in `TriageDeps`; new tests stub it with a function that tracks call count and optionally throws.
- **Current coverage of change area**: `src/engine/triage.ts` has a 95% line coverage floor enforced by `scripts/coverage-gate.mjs`. The `dryRunTriage` for-loop body (lines 299–329) is exercised by existing tests; the new guard branch is the uncovered path being added.

## Code References

- `src/engine/triage.ts:194–197` — discuss guard in `runTriage` (the pattern to mirror)
- `src/engine/triage.ts:274–331` — full `dryRunTriage` function
- `src/engine/triage.ts:299` — `for (const raw of raws)` loop start in `dryRunTriage`; guard inserts here
- `src/engine/triage.ts:303` — `processRawWithRetry` call that must be guarded
- `src/engine/triage.ts:333–359` — `loadRaws`; sets `raw.fm.priority` from frontmatter
- `src/engine/triage.ts:707–728` — `parkForDiscussion`; NOT called from `dryRunTriage` (dry-run is side-effect-free)
- `src/engine/queue.ts:6` — `Priority` type definition including `"discuss"` literal
- `tests/engine/triage-dry-run.test.ts:38–51` — `setupRepo()` helper
- `tests/engine/triage-dry-run.test.ts:53–66` — `rawBody(id, title, attempts)` helper (no `priority` param)
- `tests/engine/triage-priority.test.ts:69–81` — `rawBody(id, title, priority?)` pattern to follow when adding discuss raw support
- `docs/ENGINE.md:21` — known-limitation note describing this exact gap; must be updated after fix

## Open Questions

- The `rawBody` helper in `triage-dry-run.test.ts` does not accept a `priority` parameter. The planner must decide whether to: (a) add an optional `priority` parameter to the existing helper (matches `triage-priority.test.ts` pattern), or (b) write inline frontmatter strings only in the new tests without touching the helper. Either is valid; (a) is cleaner but touches existing helper shared by 11 tests (signature change is backward-compatible since it's optional).
- The SPEC says the skip is silent in dry-run (no `issue.parked_for_discussion` event, no file rename). The planner should confirm this means the new test must assert `agentCallCount === 0` and `reports.length === 0` but need not assert filesystem state or event absence — consistent with the dry-run contract already established by the byte-identity test.
