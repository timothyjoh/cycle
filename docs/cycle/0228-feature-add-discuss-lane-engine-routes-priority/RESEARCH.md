# Research: Cycle 0228

## Cycle Context

Cycle 0228 adds a `discuss/` lifecycle folder to the issue pipeline. When `runTriage` encounters a raw file with `priority: discuss` in its frontmatter, the engine must move the file to `docs/cycle/issues/discuss/<id>.md` unchanged, emit an `issue.parked_for_discussion` log event with `{ id, priority, path }` fields, and skip all downstream processing (no agent call, no `applyRaw`, no `tbd.jsonl` row, no `todo/` file). The feature also requires creating `docs/cycle/issues/discuss/.gitkeep` and updating `docs/RFC-001-issue-lifecycle.md` to document `discuss/` as a valid lifecycle state alongside `blocked/`.

---

## Current Codebase State

### Relevant Components

- **`runTriage` main loop** — `src/engine/triage.ts:157–266` — iterates `raws`, calls `processRawWithRetry` per raw, collects `processed`/`failed`, then handles all-fail vs. partial-fail paths. The discuss routing hook must be inserted here, before `processRawWithRetry` is called for each raw.
- **`loadRaws`** — `src/engine/triage.ts:327–353` — reads `raw/*.md`, parses frontmatter via `parseFrontmatter`, populates `RawIssue[]` including `fm` (all frontmatter fields). The `priority` field is already present in `fm` as a `FrontmatterValue` after this step.
- **`RawIssue` type** — `src/engine/triage.ts:59–65` — `{ id, body, fm, srcPath, attempts }`. `fm` is `Frontmatter` (alias for `Record<string, FrontmatterValue>`), so `fm.priority` is accessible as `string | number | string[]`.
- **`applyRaw`** — `src/engine/triage.ts:581–652` — writes `todo/<id>.md`, appends `tbd.jsonl` row, moves raw to `done/<id>_raw.md`. All of this must be bypassed for `discuss` raws.
- **`processRawWithRetry`** — `src/engine/triage.ts:90–155` — calls `ctx.runAgent`, validates output, calls `ctx.apply`. Must not be called at all for `discuss` raws.
- **`moveToFailed`** — `src/engine/triage.ts:681–699` — pattern for moving a raw file to a lifecycle folder: `mkdir({ recursive: true })` then `rename(raw.srcPath, join(dir, filename))`. This is the exact pattern to follow for moving to `discuss/`.
- **`Priority` type** — `src/engine/queue.ts:6` — `"low" | "medium" | "high" | "critical" | "discuss"`. `"discuss"` is already a valid enum value.
- **`normalizePriority`** — `src/engine/queue.ts:12–21` — recognizes `"discuss"` as a valid raw string, returns it unchanged. Used in `applyRaw:596` to set priority on todo/queue rows; not involved in the discuss routing path.
- **`Logger` interface** — `src/engine/log.ts:4–6` — `{ emit(event: string, fields: Record<string, unknown>): Promise<void> }`. All `issue.*` events use this shape: `log.emit("issue.parked_for_discussion", { id, priority, path })`.
- **`parseFrontmatter`** — `src/engine/frontmatter.ts:21–32` — parses `---\nkey: value\n---\n` blocks; `priority` field parsed as a plain string value since it contains no quotes or special chars. Returns `{ fm, bodyAfter }`.
- **RFC-001** — `docs/RFC-001-issue-lifecycle.md:22–35` — the folder layout section lists `raw/`, `todo/`, `done/`, `failed/`, `blocked/`. Needs `discuss/` added. The `blocked/` folder description at line 32–33 and the `blocked/` frontmatter block at lines 101–110 are the structural models for documenting `discuss/`.
- **`docs/cycle/issues/`** — contains `blocked/`, `done/`, `failed/`, `raw/`, `todo/` — no `discuss/` directory yet.

### Existing Patterns to Follow

- **Lifecycle folder mkdir pattern**: `await mkdir(dir, { recursive: true })` before first file operation. Used at `applyRaw:591–592` for `todoDir`/`doneDir`, and at `moveToFailed:682–683` for `failedDir`. The SPEC requires the same for `discuss/`.
- **File move pattern**: `await rename(raw.srcPath, join(targetDir, `${raw.id}.md`))` — used in `moveToFailed:695`. The discuss move must preserve file content unchanged (no frontmatter mutation), so `rename` alone (no `mutateFrontmatter`) is correct.
- **Log event shape**: `await log.emit("issue.parked_for_discussion", { id: raw.id, priority: "discuss", path: <destination path> })` — matches `log.emit(event, fields)` interface.
- **Early-return before agent call**: the for-loop body in `runTriage` at lines 193–223 calls `processRawWithRetry` and then handles the outcome. A `continue` after the discuss routing block skips both `processRawWithRetry` and the outcome-processing block.
- **`TriageDeps.runAgent` injection**: `runTriage` accepts `deps.runAgent` — tests inject a spy here. A discuss raw must not trigger the spy at all, which is verifiable by asserting the spy was not called.
- **Test file structure**: `tests/engine/triage.test.ts` and `tests/engine/triage-priority.test.ts` are the canonical homes for triage tests. Both use `mkdtemp` temp dirs, `setupRepo()` helper, `makeConfig()` helper, `makeLog()` / captured-events pattern, and `try/finally rm(root)` cleanup. `triage-priority.test.ts` specifically tests priority propagation and is the natural home for discuss routing tests.
- **`rawBody` helper in `triage-priority.test.ts`**: `rawBody(id, title, priority?)` at line 56 already accepts an optional `priority` parameter and emits it into frontmatter. Adding `priority: discuss` is supported by passing `"discuss"`.
- **Event cardinality pinning**: CLAUDE.md requires `filter(predicate).length === 1` (not `find`) for exactly-once events. `expectExactlyOne` from `tests/helpers.ts:3–10` can be used when the payload is needed.

### Dependencies & Integration Points

- **`normalizePriority` already handles `"discuss"`** — `src/engine/queue.ts:13` — no changes needed to `queue.ts`.
- **`parseFrontmatter` already handles `priority` as a plain string** — `src/engine/frontmatter.ts:21–32` — no changes needed; `raw.fm.priority` will equal `"discuss"` for a raw file with `priority: discuss` in its frontmatter.
- **`TriageDeps` type** — `src/engine/triage.ts:31–33` — only exports `runAgent?`; no new dep injection needed for the discuss routing path (it uses only `log`, `repoRoot`, and `raw`).
- **`dryRunTriage`** — `src/engine/triage.ts:268–325` — processes raws via `processRawWithRetry` with `attempts: 0` clone, no `apply`. The SPEC does not require discuss routing in `dryRunTriage` (out of scope), but the planner should note that dry-run will currently call the agent for `discuss` raws; no change required for this cycle.
- **`scripts/coverage-gate.mjs`** — `triage.ts` floor is 95% (line coverage). The discuss routing code must be covered by the new tests to maintain this floor.
- **`scripts/structural-invariants.mjs:12–37`** — two invariants on `triage.ts`: `childIds` single-Set and `childIds` variable declaration. Neither is affected by discuss routing changes.

### Test Infrastructure

- **Test framework**: Node built-in test runner (`node:test`) with `--experimental-strip-types`. No transpile step.
- **Test directory**: `tests/engine/` — triage tests are `tests/engine/triage.test.ts` and `tests/engine/triage-priority.test.ts`.
- **Test helpers**: `tests/helpers.ts:3–10` — `expectExactlyOne(events, eventName)` asserts exactly-once and returns the matched event.
- **Mock pattern**: `TriageDeps.runAgent` is a spy-injectable async function. Tests pass `{ runAgent: async () => ({...}) }` to verify agent call behavior.
- **`makeLog()` pattern**: returns `{ log, events }` where `events: Captured[]` (`{ event, fields }`). Events array is checked post-run via `events.filter(e => e.event === "...")`.
- **`setupRepo()` pattern**: creates temp dir with `.cycle/prompts/triage.md`, `docs/cycle/issues/raw/`, `todo/`, `done/`, `failed/`. The `discuss/` directory is NOT created by the current `setupRepo()` in either test file — new tests may rely on the implementation's `mkdir({ recursive: true })` to create it, or `setupRepo()` can be extended.
- **Existing coverage of `triage.ts`**: Prior cycle commentary puts current line coverage well above the 95% floor. New branches (the `priority === "discuss"` check and the discuss move path) must be covered to avoid regression.

---

## Code References

- `src/engine/triage.ts:59–65` — `RawIssue` type; `fm.priority` accessible as `FrontmatterValue`
- `src/engine/triage.ts:90–155` — `processRawWithRetry`; must not be called for discuss raws
- `src/engine/triage.ts:157–266` — `runTriage`; main loop where discuss routing hook goes (lines 193–223)
- `src/engine/triage.ts:327–353` — `loadRaws`; populates `fm` including `priority`
- `src/engine/triage.ts:581–652` — `applyRaw`; writes todo + queue + moves raw to done
- `src/engine/triage.ts:681–699` — `moveToFailed`; template for discuss folder move (mkdir + rename, no frontmatter mutation needed for discuss)
- `src/engine/queue.ts:6` — `Priority` type includes `"discuss"`
- `src/engine/queue.ts:12–21` — `normalizePriority` recognizes `"discuss"`
- `src/engine/log.ts:4–6` — `Logger` interface; `emit(event, fields)` shape
- `src/engine/frontmatter.ts:21–32` — `parseFrontmatter`; no changes needed
- `docs/RFC-001-issue-lifecycle.md:22–35` — folder layout block; `discuss/` must be added
- `docs/RFC-001-issue-lifecycle.md:101–110` — `blocked/` frontmatter block; structural model for `discuss/` documentation
- `tests/engine/triage.test.ts:39–47` — `makeLog()` with captured events array; pattern for event assertions
- `tests/engine/triage.test.ts:49–62` — `setupRepo()` helper
- `tests/engine/triage-priority.test.ts:56–68` — `rawBody(id, title, priority?)` helper; already supports `priority: discuss`
- `tests/helpers.ts:3–10` — `expectExactlyOne(events, eventName)`
- `scripts/coverage-gate.mjs:13` — `triage.ts` floor: 95%
- `scripts/structural-invariants.mjs:12–37` — two `childIds` invariants on `triage.ts`; not affected by this change

---

## Open Questions

- **Where to insert the routing check in the `runTriage` loop**: the for-loop body (lines 193–223) calls `processRawWithRetry` and then handles `outcome`. The discuss check must come before `processRawWithRetry`. A `continue` after the move+emit skips the rest of the loop body. The planner should confirm: does the discuss raw's `id` appear in `processed` or neither array? The SPEC says "skip all downstream processing" — the raw does not appear in `processed` or `failed`, which matches a bare `continue` that bypasses both push sites.
- **`dryRunTriage` behavior with `discuss` raws**: the SPEC explicitly marks CLI commands and dry-run discuss routing as out of scope. The planner should note whether `dryRunTriage` needs a skip or can safely call the agent for `discuss` raws (calling the agent in dry-run is inconsistent with production behavior but is not a blocker for this cycle).
- **`setupRepo()` in tests**: neither existing `setupRepo()` creates a `discuss/` directory. Tests should rely on the implementation's `mkdir({ recursive: true })` creating it; the planner should confirm no test assertion against directory pre-existence is needed.
- **Path value in `issue.parked_for_discussion` event**: the `path` field should be the destination path (`join(repoRoot, "docs/cycle/issues/discuss", `${raw.id}.md`)`) or the relative path. No established convention for path field format in `issue.*` events exists in the current log; the planner should pick one and document it.
