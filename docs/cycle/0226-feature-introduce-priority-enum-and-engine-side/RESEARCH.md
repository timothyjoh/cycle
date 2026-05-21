I have enough context to write the research document.

# Research: Cycle 0226

## Cycle Context

This cycle replaces the two-field numeric priority system (`priority: 1–10` and `priority_hint`) with a single `Priority` enum (`low | medium | high | critical | discuss`) and adds deterministic engine-side sort to the queue drain path. Currently `QueueRow` has no priority field; ordering is fully agent-driven via `rewriteOrdering`. After this cycle the engine owns sort order — `critical → high → medium → low → discuss` — while preserving insertion order within each tier and respecting `depends_on` topology. Numeric values at read time are normalized to enum values; `materializeFreeformIssue` emits `priority: 'medium'` instead of `priority: 3`.

---

## Current Codebase State

### Relevant Components

- **`QueueRow` type and `isQueueRow` guard**: `src/engine/queue.ts:6–15` — current fields: `id`, `parent?`, `title`, `status`, `attempt`, `depends_on`, `triaged_at`, `cycle_id?`. No `priority` field. `isQueueRow` at `:32–42` validates these fields; does not check `priority`.
- **`readQueue`**: `src/engine/queue.ts:44–66` — reads and parses `.cycle/tbd.jsonl`, filters through `isQueueRow`, returns rows verbatim with no normalization pass.
- **`popNextPending`**: `src/engine/queue.ts:129–135` — iterates rows and returns the first with `status === "pending"`. No sort; pure FIFO from file order.
- **`writeQueue`**: `src/engine/queue.ts:68–75` — serializes rows as JSONL via tmp-rename; no sort applied.
- **`appendRow`**: `src/engine/queue.ts:77–80` — appends a single row to the JSONL file.
- **Triage `applyRaw`**: `src/engine/triage.ts:580–648` — constructs `QueueRow` at `:612–620` with fields `{id, title, status, attempt, depends_on, triaged_at}` (and optional `parent`). No `priority` field emitted into the row or into the `todo/<id>.md` frontmatter object at `:597–605`.
- **`rewriteOrdering`**: `src/engine/triage.ts:697–722` — on triage success, rewrites `tbd.jsonl` to match the agent-emitted `ordering[]` array. In-progress rows are preserved at the front; pending rows are sorted per the ordering array. This is currently the only sort mechanism.
- **`TriageChild` type**: `src/engine/triage.ts:42–50` — fields `{raw_id, slug, id, title, workflow, depends_on, body}`. No `priority` field.
- **`validateOutput`**: `src/engine/triage.ts:385–578` — validates the agent's JSON output. Checks `children[i]` fields against `stringFields` array at `:439–446`: `raw_id, slug, id, title, workflow, body`. No `priority` check.
- **Queue drain loop**: `src/cli.ts:436–545` — calls `popNextPending` at `:447`, proceeds to `markInProgress` and `spawnRunOne`. No sort or priority lookup between triage and pop.
- **`materializeFreeformIssue`**: `src/issue/materialize.ts:5–30` — emits `priority: ${priority}` where `priority: number = 3` is the default parameter. Called from `src/cli.ts:88` with `args.priority` (for `cycle drop`) and from `:94` with no priority argument (uses default `3`).
- **`DropArgs.priority`**: `src/cli/parse-args.ts:14–16` — `priority: number`. Parsed as integer 1–10 at `:40–51`, default `3`. Validation message references "integer 1..10".
- **Reflection `priority_hint`**: `src/engine/reflection.ts` — `ingestReflection` materializes each `sharp_edges[]` entry; the `{title, body, priority_hint}` shape is in RFC-001 §9. `priority_hint` is written into the raw file frontmatter when present. It currently flows into `raw/` but `isQueueRow` never sees it (it is never in `tbd.jsonl` rows).
- **`raw/` frontmatter `priority` field**: RFC-001 §3 documents it as an "optional hint to triage; not honored automatically"; `cycle drop` emits it as numeric `3` by default.

### Existing Patterns to Follow

- **Type guard pattern**: `isQueueRow` at `src/engine/queue.ts:32–42` uses an `obj.field !== "a" && obj.field !== "b"` pattern for status validation. The new `priority` field guard should follow the same pattern: check against all known enum string values.
- **JSONL normalization at read time**: `readQueue` already filters via `isQueueRow` before returning. Numeric normalization should be inserted before the guard or inside `readQueue` as a pre-guard transform, similar to the existing `isLegacyLine` / `bootstrapArchiveIfLegacy` split.
- **`QueueRow` constructor in `applyRaw`**: `src/engine/triage.ts:612–620` — new fields added to `QueueRow` must also be added here when constructing the row. Pattern: construct the object literal inline, add the field.
- **Todo frontmatter object in `applyRaw`**: `src/engine/triage.ts:597–605` — `fm: Frontmatter` is built inline. New frontmatter fields for the todo file are added to this object.
- **`Frontmatter` type**: `src/engine/frontmatter.ts` — used by `parseFrontmatter` / `serializeFrontmatter`. It is a `Record<string, unknown>` (or similar open type); additional fields written here survive round-trips without type changes.
- **Triage child raw issue `priority` field**: currently read by `loadRaws` via `parseFrontmatter` into `raw.fm` at `src/engine/triage.ts:337–351`. The field is accessible as `raw.fm.priority` in `applyRaw` when constructing child rows and todo frontmatter.
- **Stable sort**: `Array.prototype.sort` is stable in Node 22 (V8 TimSort). A comparator returning `0` for same-tier rows preserves insertion order (the existing `triaged_at` order from `tbd.jsonl`).
- **Test helper `expectExactlyOne`**: `tests/helpers.ts:3–10` — used for exactly-once event assertions. New queue-sort tests will use direct array comparisons rather than event helpers.
- **Test `row()` factory**: `tests/engine/queue.test.ts:26–36` — returns a minimal `QueueRow` with overrides. New tests must extend this factory (or create a new one) to include `priority`.
- **Triage test `setupRepo` / `makeConfig` / `makeLog`**: `tests/engine/triage.test.ts:23–62` — standard fixture pattern used by all triage tests; new triage priority tests should reuse these.
- **`rawBody()` helper**: `tests/engine/triage.test.ts:64–77` — builds raw issue file content. Will need a variant or parameter to include a `priority` field in frontmatter.

### Dependencies & Integration Points

- **`src/engine/queue.ts`** — primary change target: `Priority` type export, `QueueRow` field addition, `isQueueRow` guard update, `readQueue` normalization pass, sort function (new export or internal).
- **`src/engine/triage.ts`** — secondary change target: `applyRaw` must write `priority` into the `QueueRow` row and the `todo/<id>.md` frontmatter; `TriageChild` type may need a `priority?` field if the agent emits it; triage reads `raw.fm.priority` to propagate the value.
- **`src/issue/materialize.ts`** — `materializeFreeformIssue` default parameter changes from `priority: number = 3` to emitting `priority: 'medium'`; type signature changes from `number` to `string` (or `Priority`); `src/cli/parse-args.ts` `DropArgs.priority` type must change accordingly.
- **`src/cli/parse-args.ts`** — `DropArgs.priority` currently `number`; will become `Priority` string enum; `--priority` flag parsing logic changes from integer range check to string union membership check.
- **`src/cli.ts:88`** — calls `materializeFreeformIssue(args.text, cwd, new Date(), args.priority)` passing `args.priority`; must remain compatible after type change.
- **`src/cli.ts:436–448`** — queue drain loop calls `popNextPending` then uses `row` directly; the sort must happen either inside `popNextPending` (via a pre-sort `readQueue`) or as a new helper called by the CLI before pop. The SPEC targets `src/engine/run-cycle.ts` or `src/engine/queue.ts` for the sort; the actual drain call site is `src/cli.ts` via `popNextPending`.
- **`popNextPending`** depends on `readQueue`; if `readQueue` returns rows pre-sorted, `popNextPending` automatically picks the highest-priority pending row.
- **`rewriteOrdering`** in `src/engine/triage.ts:697–722` — still runs after each successful triage pass and rewrites `tbd.jsonl` in agent-specified order. Engine-side sort at `readQueue` time runs on top of whatever order `rewriteOrdering` left in the file, so the two mechanisms compose without conflict.
- **`scripts/coverage-gate.mjs:12–28`** — `FLOORS` table. If a new module is created (unlikely — changes are in-place to existing files), a new floor entry is required. If `src/engine/queue.ts` coverage is not already floored, the SPEC requires adding it; currently `queue.ts` is not in the FLOORS table.

### Test Infrastructure

- **Framework**: Node built-in test runner (`node:test`), imported as `import { test } from "node:test"`. No transpile step; tests run with `--experimental-strip-types`.
- **Assertion library**: `node:assert` strict mode — `import { strict as assert } from "node:assert"`.
- **Test discovery**: `npm test` runs `node --test tests/**/*.test.ts` (or similar glob); new test files in `tests/engine/` or `tests/issue/` are picked up automatically.
- **Fixture pattern**: `mkdtemp` + `mkdir` + `writeFile` for tmp repo roots; `rm(root, { recursive: true, force: true })` in `finally`. No shared state between tests.
- **Logger stub**: `makeLog()` pattern from `tests/engine/triage.test.ts:39–47` — returns `{ log, events }` where `log.emit` pushes to the array.
- **Cardinality pinning**: exactly-once events use `filter(…).length === 1` or `expectExactlyOne` from `tests/helpers.ts`.
- **Current coverage of change area**:
  - `src/engine/queue.ts` — not in FLOORS table; covered by `tests/engine/queue.test.ts` (18 tests).
  - `src/engine/triage.ts` — floor 95%; covered by `tests/engine/triage.test.ts`, `tests/engine/triage.faults.test.ts`, `tests/engine/triage-validator.test.ts`, `tests/engine/triage-dry-run.test.ts`.
  - `src/issue/materialize.ts` — not in FLOORS table; covered by `tests/issue/materialize.test.ts` (2 tests).
  - `src/cli/parse-args.ts` — not in FLOORS table; covered by `tests/cli/parse-args.test.ts`.

---

## Code References

- `src/engine/queue.ts:4` — `QueueRowStatus` type
- `src/engine/queue.ts:6–15` — `QueueRow` type (no `priority` field today)
- `src/engine/queue.ts:25–30` — `isLegacyLine` guard
- `src/engine/queue.ts:32–42` — `isQueueRow` guard (must add `priority` validation)
- `src/engine/queue.ts:44–66` — `readQueue` (normalization pass goes here)
- `src/engine/queue.ts:129–135` — `popNextPending` (FIFO; sort changes this behavior)
- `src/engine/triage.ts:42–50` — `TriageChild` type
- `src/engine/triage.ts:337–351` — `loadRaws` parses raw frontmatter into `raw.fm` (includes `priority` if present)
- `src/engine/triage.ts:597–605` — todo frontmatter construction in `applyRaw` (add `priority`)
- `src/engine/triage.ts:612–620` — `QueueRow` construction in `applyRaw` (add `priority`)
- `src/engine/triage.ts:697–722` — `rewriteOrdering` (agent-driven ordering; engine sort runs on top at drain time)
- `src/issue/materialize.ts:5–30` — `materializeFreeformIssue` (default `priority: number = 3` becomes `'medium'`)
- `src/cli/parse-args.ts:14–16` — `DropArgs.priority: number` (becomes `Priority` string)
- `src/cli/parse-args.ts:40–51` — `--priority` integer parsing (becomes enum string validation)
- `src/cli.ts:88` — `cycle drop` call site for `materializeFreeformIssue`
- `src/cli.ts:447` — `popNextPending` call in main drain loop
- `scripts/coverage-gate.mjs:12–28` — `FLOORS` table (no entry for `queue.ts` currently)
- `tests/engine/queue.test.ts:26–36` — `row()` factory (needs `priority` field after type change)
- `tests/issue/materialize.test.ts:22–29` — asserts `priority: 3` in frontmatter (must update)
- `tests/cli/drop-priority.test.ts:23` — asserts `priority: 5` numeric in frontmatter (must update or replace)

---

## Open Questions

1. **Sort location**: The SPEC says sort belongs in the "queue drain path" citing `run-cycle.ts` or `queue.ts`. The actual drain entry point is `popNextPending` in `src/engine/queue.ts`, which is called from `src/cli.ts`. Inserting sort into `readQueue` means every consumer (including `rewriteOrdering` in `triage.ts`) gets sorted reads — which may subtly change `rewriteOrdering`'s input. Alternatively, sort only inside `popNextPending`. The planner should decide whether sort lives in `readQueue` (affects all callers) or only in `popNextPending` (affects only drain).

2. **Topological clamp implementation**: The SPEC requires that a high-priority child depending on a low-priority parent runs after its parent despite tier order. The existing `popNextPending` has no dependency-skip logic — it returns the first pending row with no `depends_on` check. Dependency skipping (skip rows whose `depends_on` contains an unsatisfied id) is documented in RFC-001 §6 but is not currently implemented in `popNextPending`. The planner must determine whether topological clamp is added to the sort step (move dependents after their dependencies before popping) or to the pop step (skip rows with unsatisfied deps, same as RFC-001 spec but not yet implemented).

3. **`TriageChild.priority` field**: The triage agent does not currently emit `priority` in its JSON children. If the planner wants triage to forward the raw issue's `priority` to children, it can either (a) read `raw.fm.priority` in `applyRaw` and write it to the child's row/frontmatter without requiring the agent to emit it, or (b) add `priority` to `TriageChild` and require it in `validateOutput`. Option (a) avoids breaking the agent contract; the SPEC language ("read raw issue `priority`, default absent to `'medium'`") supports option (a).

4. **`--priority` flag migration**: `parse-args.ts` currently accepts integers 1–10 for `--priority`. After the change, valid values are `low | medium | high | critical | discuss`. Existing tests in `tests/cli/drop-priority.test.ts` and `tests/cli/parse-args.test.ts` that pass numeric values will need updating. The error message also references "integer 1..10" and must change.

5. **`src/engine/queue.ts` coverage floor**: The SPEC says "Coverage floor added for any new source module." `queue.ts` is an existing module with no floor in the FLOORS table. The SPEC does not explicitly require adding a floor for it, but if the planner adds significant new logic (normalization, sort) they may want to add one. Clarification welcome.
