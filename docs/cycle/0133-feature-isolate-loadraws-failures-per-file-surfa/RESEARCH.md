I have all the information needed. Writing the research document now.

```markdown
# Research: Cycle 0133

## Cycle Context
Refactor `loadRaws` in `src/engine/triage.ts` so a single malformed raw file no longer aborts the entire triage pass. Each failing file (readFile or parseFrontmatter error) should emit a `triage.raw.load_error {raw_id, error}` event and be skipped; surviving raws proceed normally. `loadRaws` gains a `log: Logger` parameter. Test 6a is rewritten to assert isolation; two new tests cover all-fail and mixed scenarios.

## Current Codebase State

### Relevant Components

- **`loadRaws` function**: `src/engine/triage.ts:325-343` — private (unexported) async function. Signature: `async function loadRaws(rawDir: string): Promise<RawIssue[]>`. Wraps `readdir` in try/catch (ENOENT returns `[]`), then loops over `.md` files sorted alphabetically. For each file: calls `readFile(srcPath, "utf8")` then `parseFrontmatter(body)` — neither is wrapped in try/catch. On any parse/read error the entire function throws, aborting the caller. Returns `RawIssue[]` where each element carries `{ id, body, fm, srcPath, attempts }`.

- **`runTriage` caller**: `src/engine/triage.ts:169` — calls `await loadRaws(rawDir)` after `mkdir(rawDir, { recursive: true })`. Already holds a `log: Logger` parameter (function signature line 156: `log: Logger`). No changes needed to runTriage beyond updating the call site to pass `log`.

- **`dryRunTriage` caller**: `src/engine/triage.ts:267-323` — exported, signature `async function dryRunTriage(repoRoot, cfg, deps)` — no `log` parameter. Calls `await loadRaws(rawDir)` at line 274. If `loadRaws` gains a required `log` parameter, `dryRunTriage` must also accept one or use a no-op logger internally.

- **`truncateHeadCapped`**: `src/engine/log-fmt.ts:1-3` — already imported in triage.ts at line 20. Used at line 245 in the all-fail branch to cap error strings at 2000 chars. Available for use in `loadRaws` for the new `triage.raw.load_error` event.

- **`parseFrontmatter`**: `src/engine/frontmatter.ts:21-32` — synchronous, throws `new Error("no frontmatter")` if no `---\n...\n---\n` block found. Also throws for malformed YAML lines (silently skips unknown lines). Imported at triage.ts line 5.

- **`Logger` type**: `src/engine/log.ts:4-6` — `{ emit: (event: string, fields: Record<string, unknown>) => Promise<void> }`. Already imported in triage.ts at line 19 as a type import.

- **`RawIssue` type**: `src/engine/triage.ts:58-64` — `{ id, body, fm, srcPath, attempts }`. Internal to the module (not exported).

- **Coverage gate**: `scripts/coverage-gate.mjs:13` — `"src/engine/triage.ts": 95` (line coverage floor ≥95%). Enforced automatically after `npm run test:coverage`.

- **Test 6a (current)**: `tests/engine/triage.faults.test.ts:392-413` — asserts `runTriage` rejects with `/no frontmatter/`. The test writes a `broken.md` with no frontmatter, calls `runTriage`, expects rejection. Must be rewritten in-place per SPEC.

- **Test 6b (current)**: `tests/engine/triage.faults.test.ts:417-440` — tests missing `raw/` directory (ENOENT on readdir). Exercises the existing try/catch at `loadRaws:327-330`. This test remains unchanged.

### Existing Patterns to Follow

- **Event emission pattern**: `await log.emit("event.name", { field1: val1, ... })` — used throughout runTriage (lines 171, 174, 201-205, 211-216, 247-251, 260-262, 708). New `triage.raw.load_error` follows same shape.

- **Error truncation pattern**: `truncateHeadCapped(errorString, 2000)` — used at triage.ts:245 for `last_errors` in `engine.paused`. Apply same cap to `error` field in `triage.raw.load_error`.

- **raw_id from filename**: When frontmatter parse fails, `fm.id` is unavailable. SPEC says derive from filename by stripping `.md`. In `loadRaws`, the loop variable `f` is the filename (e.g. `"broken.md"`); `raw_id = f.replace(/\.md$/, "")`. This is the only safe source when parse failed.

- **Silent catch + continue pattern**: Used in `bumpAttempts` (line 657-664), `moveToFailed` (lines 672-686), `applyRaw` rollback (lines 619-638). Per-file isolation in `loadRaws` follows same shape: `try { ... raws.push(...) } catch (e) { await log.emit(...); continue; }`.

- **Test helper pattern**: `makeLog()` at line 41 returns `{ log, events }` where `events` is a `Captured[]` array; tests inspect `events.find(e => e.event === "...")` to assert event emission. New tests must use same helper.

- **`rawBody()` helper**: `tests/engine/triage.faults.test.ts:66-79` — generates valid frontmatter raw content. New tests use this for the "surviving" raw file.

- **`setupRepo()` helper**: `tests/engine/triage.faults.test.ts:51-64` — creates tmpdir with all required subdirs (`.cycle/prompts`, `docs/cycle/issues/raw`, `todo`, `done`, `failed`). New tests use this.

- **`reversedDecomposeJson` / `enrichJson` helpers**: Tests 5 and 7 have local helpers that generate valid triage agent JSON output. New mixed-scenario test needs similar helper for the "good raw" case.

### Dependencies & Integration Points

- **`src/engine/triage.ts` imports**: `readFile`, `writeFile`, `readdir`, `mkdir`, `rename`, `unlink` (node:fs/promises); `parseFrontmatter`, `serializeFrontmatter`, `mutateFrontmatter`, `Frontmatter` (frontmatter.ts); `readQueue`, `writeQueue`, `appendRow`, `bootstrapArchiveIfLegacy`, `QueueRow` (queue.ts); `resolveAgent` (exec.ts); `CycleConfig`, `TriageConfig` (workflow.ts); `Logger` (log.ts); `truncateHeadCapped` (log-fmt.ts). No new imports are needed for the refactor.

- **`dryRunTriage` exported function**: Called from `src/cli.ts` for `cycle triage --dry-run`. Any signature change to `loadRaws` must be compatible with `dryRunTriage`'s call site. Currently `dryRunTriage` has no `log` parameter; planner must decide: (a) add optional `log?: Logger` to `dryRunTriage` and pass through, (b) create no-op logger inside `loadRaws` when `log` is undefined, or (c) make `log` optional on `loadRaws` with a default no-op.

- **`src/cli.ts` usage of `dryRunTriage`**: Needs investigation to confirm whether `dryRunTriage` call site in `cli.ts` passes a logger already or not.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`) with `node:assert/strict`.
- **Test file for change**: `tests/engine/triage.faults.test.ts` — 7 tests currently (Tests 1-5, 6a, 6b, 7). New tests appended after rewritten 6a per SPEC.
- **No mock module**: Tests inject `runAgent` via `TriageDeps` dependency injection — no `mock.method` or module-level mocking. `loadRaws` is private; tests exercise it via `runTriage`.
- **After cycle 0132**: `loadRaws` is now exported (per cycle 0132 quickfix — see session context). This means new tests CAN call `loadRaws` directly if needed.
- **Coverage of change area**: `triage.ts` has a ≥95% line floor. Current Test 6a covers the throw path; rewriting it removes that coverage. New tests must cover the `catch` branch in the per-file loop to hold the floor.

## Code References

- `src/engine/triage.ts:325-343` — `loadRaws` function body, both callers at :169 and :274
- `src/engine/triage.ts:20` — `truncateHeadCapped` import already present
- `src/engine/triage.ts:156-265` — `runTriage` with `log: Logger` parameter
- `src/engine/triage.ts:267-323` — `dryRunTriage` without `log` parameter
- `src/engine/triage.ts:229-253` — all-fail branch that emits `engine.paused`; survives unchanged since `loadRaws` returning `[]` triggers the existing `raws.length === 0` short-circuit at line 173
- `src/engine/log-fmt.ts:1-3` — `truncateHeadCapped` implementation
- `src/engine/log.ts:4-6` — `Logger` type
- `src/engine/frontmatter.ts:21-32` — `parseFrontmatter` throws `"no frontmatter"` on missing block
- `tests/engine/triage.faults.test.ts:41-48` — `makeLog()` helper
- `tests/engine/triage.faults.test.ts:51-64` — `setupRepo()` helper
- `tests/engine/triage.faults.test.ts:66-79` — `rawBody()` helper
- `tests/engine/triage.faults.test.ts:392-413` — Test 6a (rewrite target)
- `scripts/coverage-gate.mjs:13` — per-file floor for `triage.ts`
- `docs/ENGINE.md:15-17` — triage section; needs update to mention `triage.raw.load_error` and per-file isolation

## Open Questions

1. **`dryRunTriage` log parameter**: When `loadRaws` gains `log: Logger`, `dryRunTriage` has no logger to pass. Options: (a) add optional `log?: Logger` to `dryRunTriage`; (b) make `loadRaws`'s `log` optional with internal no-op default; (c) create a silent logger stub inside `loadRaws` when `log` is absent. The planner must choose one and assess whether `cli.ts`'s `dryRunTriage` call site needs updating.

2. **all-fail via load error**: If all raws fail to load, `loadRaws` returns `[]`. The existing `raws.length === 0` check at `runTriage:173` emits `triage.end` and returns `{ status: "ok" }` — NOT `engine.paused`. SPEC says the new test "all raws fail load → `engine.paused {reason:"all_triage_failed"}` still fires (or equivalent halting behavior — pin in test)". Since all-load-failure returns `[]` which hits the empty-queue short-circuit, the behavior is `status: "ok"`, NOT `engine.paused`. Planner must decide: (a) treat load errors as adding to the `failed` array so the existing all-fail path fires; (b) accept that all-load-fail yields `status:"ok"` (distinct from all-triage-fail) and document the distinction. The SPEC's "or equivalent — pin in test" clause gives latitude here.

3. **`loadRaws` export status after cycle 0132**: Session context notes cycle 0132 exported `loadRaws`. If already exported, new tests can call it directly (eliminating need to route through `runTriage` for the isolation test). Planner should verify current export status before designing tests.
```
