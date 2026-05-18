Have all data needed. Writing the research document.

```markdown
# Research: Cycle 0149

## Cycle Context

SPEC asks for two deliverables: (1) add a "Test conventions" subsection to
`CLAUDE.md` documenting the `filter(...).length === 1` rule for exactly-once
engine events, citing cycles 0022/0051; and (2) introduce a generic
`expectExactlyOne(events, eventName)` helper and use it to migrate 8
offender sites in `tests/cli/halt.test.ts` (2 sites, `engine.halted`) and
`tests/engine/reflection.test.ts` (6 sites, `reflection.summary`) from
existence-only `find(...)` to strict cardinality assertions.

---

## Current Codebase State

### Relevant Components

- **halt.test.ts** — CLI-level integration tests; spins real `node dist/cycle.js run` subprocess — `tests/cli/halt.test.ts`
- **reflection.test.ts** — Unit tests calling `ingestReflection` directly with a fake logger — `tests/engine/reflection.test.ts`
- **CLAUDE.md** — Project conventions file with no "Test conventions" section yet — `CLAUDE.md`
- **resume.test.ts** — Contains the existing correct `filter().length === 1` pattern used as the reference example — `tests/cli/resume.test.ts:197-198`

### Offender Sites (exact current lines)

**halt.test.ts** — events type is `Array<Record<string, unknown>>` (flat, top-level fields):

| SPEC line ref | Current line | Pattern |
|---|---|---|
| 119 | ~122 | `const halted = events.find((e) => e.event === "engine.halted") as Record<string, unknown>` |
| 187 | ~190 | `const halted = events.find((e) => e.event === "engine.halted") as Record<string, unknown>` |

Post-`find` assertions in both sites access flat top-level fields:
- `halted.reason`, `halted.threshold`, `halted.failed_cycles` — `tests/cli/halt.test.ts:124-127`
- `halted.threshold`, `halted.failed_cycles` — `tests/cli/halt.test.ts:192-193`

**reflection.test.ts** — events type is `EmittedEvent[]` = `{ event: string; fields: Record<string, unknown> }` (payload nested under `.fields`):

| SPEC line ref | Current line | Pattern |
|---|---|---|
| 77 | 77 | `const summary = events.find((e) => e.event === "reflection.summary")` |
| 112 | 112 | `const summary = events.find((e) => e.event === "reflection.summary")` |
| 159 | 159 | `const summary = events.find((e) => e.event === "reflection.summary")` |
| 182 | 182 | `const summary = events.find((e) => e.event === "reflection.summary")` |
| 257 | 257 | `const summary = events.find((e) => e.event === "reflection.summary")` |
| 357 | 357 | `const summary = events.find((e) => e.event === "reflection.summary")` |

Post-`find` assertions in all 6 sites use `summary!.fields.count` and
`summary!.fields.skipped` — `tests/engine/reflection.test.ts:79-80,
113-115, 160-161, 183-184, 258-259, 358-359`.

### Critical Type Mismatch Between the Two Test Files

The two test files use **structurally different event shapes**:

- `halt.test.ts`: events are `Array<Record<string, unknown>>` where
  payload fields live at the top level (e.g., `halted.reason`). Source:
  `readEvents()` at `tests/cli/halt.test.ts:103-106` parses each
  `log.jsonl` line with `JSON.parse` — the raw log events have flat
  structure.

- `reflection.test.ts`: events are `EmittedEvent[]` =
  `{ event: string; fields: Record<string, unknown> }` where payload is
  nested under `.fields` (e.g., `summary!.fields.count`). Source:
  `makeLogger()` at `tests/engine/reflection.test.ts:10-21`.

These are not the same type. A single `expectExactlyOne` helper written
against one shape cannot be directly used against the other without
generics or overloads. No `EngineEvent` type exists anywhere in `src/`
— the SPEC's reference to it is aspirational. The only type in
`src/engine/log-tail.ts:14` is `LogEvent` (local to that file).

### Existing Correct Patterns (reference models)

- `tests/cli/resume.test.ts:197-198` — length-check then separate
  find-for-payload (two-step):
  ```ts
  assert.equal(eventTypes.filter((t) => t === "engine.resume").length, 1, "engine.resume emitted once");
  const engineResume = events.find((e) => e.event === "engine.resume") as Record<string, unknown>;
  ```

- `tests/engine/reflection.test.ts:238-241` — length-only (no payload
  bind needed):
  ```ts
  const skipCount = events.filter((e) => e.event === "reflection.skipped").length;
  assert.equal(skipCount, 1, "exactly one reflection.skipped — no loop");
  const summaryCount = events.filter((e) => e.event === "reflection.summary").length;
  assert.equal(summaryCount, 1, "exactly one reflection.summary");
  ```

- `tests/engine/blocked.test.ts:173` — inline:
  ```ts
  assert.equal(events.filter((e) => e.event === "queue.propagate_blocked").length, 1);
  ```

### No Shared Test Utilities File

No `tests/helpers/`, `tests/shared/`, or `tests/fixtures/helpers.ts`
exists. All test helpers are file-local. The SPEC introduces
`expectExactlyOne` as a new helper — it has no existing home; the
planner must decide whether to put it in each file locally or create a
new shared module.

### CLAUDE.md Structure

Current sections (no "Test conventions" yet) — `CLAUDE.md:1-68`:
1. Workflow style (line 3)
2. Runtime (line 13)
3. Commands (line 18)
4. Coverage policy (line 32)
5. Structural-invariants policy (line 38)
6. Architecture (line 42)
7. Subprocess discipline (line 54)
8. Workflow defaults (line 59)
9. Publishing (line 63)

### Test Framework

- `node:test` + `node:assert` (strict). No transpilation.
  `--experimental-strip-types` (Node ≥ 22.6).
- Tests run via `npm test` (pretest builds) — `package.json`.
- Coverage via `npm run test:coverage` (LCOV).
- No Jest, no Vitest, no Mocha.

---

## Code References

- `tests/cli/halt.test.ts:103-106` — `readEvents()` helper; parses
  `log.jsonl` into `Array<Record<string, unknown>>` (flat event shape)
- `tests/cli/halt.test.ts:122` — offender #1: `engine.halted` find
- `tests/cli/halt.test.ts:124-127` — payload assertions after offender #1
  (`.reason`, `.threshold`, `.failed_cycles`)
- `tests/cli/halt.test.ts:190` — offender #2: `engine.halted` find
- `tests/cli/halt.test.ts:192-193` — payload assertions after offender #2
- `tests/engine/reflection.test.ts:9` — `EmittedEvent` type definition
  (`{ event: string; fields: Record<string, unknown> }`)
- `tests/engine/reflection.test.ts:10-21` — `makeLogger()` — source of
  the `EmittedEvent[]` array
- `tests/engine/reflection.test.ts:77` — offender #3: `reflection.summary` find
- `tests/engine/reflection.test.ts:79-80` — payload assertions (`.fields.count`, `.fields.skipped`)
- `tests/engine/reflection.test.ts:112` — offender #4
- `tests/engine/reflection.test.ts:113-115` — payload assertions
- `tests/engine/reflection.test.ts:159` — offender #5
- `tests/engine/reflection.test.ts:160-161` — payload assertions
- `tests/engine/reflection.test.ts:182` — offender #6
- `tests/engine/reflection.test.ts:183-184` — payload assertions
- `tests/engine/reflection.test.ts:257` — offender #7
- `tests/engine/reflection.test.ts:258-259` — payload assertions
- `tests/engine/reflection.test.ts:357` — offender #8
- `tests/engine/reflection.test.ts:358-359` — payload assertions
- `tests/engine/reflection.test.ts:238-241` — existing correct
  `filter().length` pattern (reference)
- `tests/cli/resume.test.ts:197-198` — existing correct
  `filter().length === 1` pattern (reference)
- `src/engine/log-tail.ts:14` — only `LogEvent` type in src (not the
  `EngineEvent` the SPEC references)
- `CLAUDE.md:42-53` — Architecture section; "Test conventions" subsection
  would be added nearby

---

## Open Questions

1. **Helper placement**: The two test files use incompatible event shapes
   (`Record<string, unknown>` flat vs. `EmittedEvent` with nested
   `.fields`). A single generic helper would need to be typed against a
   common `{ event: string }` bound and return the concrete type via
   generics or a union. Should `expectExactlyOne` be defined locally in
   each file with file-appropriate types, or in a new shared module
   (`tests/helpers.ts`)? The planner must choose.

2. **Exact CLAUDE.md placement**: Which section should "Test conventions"
   be added to — a new top-level section, or a subsection under
   "Architecture" or "Coverage policy"? The SPEC says "subsection" but
   does not specify the parent.

3. **SPEC line-number drift**: SPEC cites halt.test.ts lines 119 and 187;
   current lines appear to be ~122 and ~190 due to edits since the issue
   was filed. Planner should verify exact current lines before
   implementing.
```
