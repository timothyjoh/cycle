All data confirmed. Writing plan to stdout now.

`★ Insight ─────────────────────────────────────`
The two test files use structurally incompatible event shapes — but `T extends { event: unknown }` covers both: `Record<string, unknown>`'s index signature makes all keys `unknown`, and `EmittedEvent.event: string` satisfies `event: unknown`. One generic helper serves both files without casts or overloads.
`─────────────────────────────────────────────────`

```markdown
# Implementation Plan: Cycle 0149

## Overview
Add a "Test conventions" section to CLAUDE.md documenting the `filter().length === 1`
cardinality-pinning rule for exactly-once engine events, introduce a shared
`expectExactlyOne` helper in `tests/helpers.ts`, and migrate 8 offender sites in
`halt.test.ts` (lines 122, 190) and `reflection.test.ts` (lines 77, 112, 159, 182,
257, 357) from existence-only `find()` to strict cardinality assertions.

## Current State (from Research)

- `halt.test.ts` uses `events.find(...)` at lines **122 and 190** for `engine.halted`
  (SPEC cited 119/187 — actual lines drifted by ~3 due to edits). Events are
  `Array<Record<string, unknown>>` (flat shape from `readEvents()`).
- `reflection.test.ts` uses `events.find(...)` at lines **77, 112, 159, 182, 257, 357**
  for `reflection.summary`. Events are `EmittedEvent[]` =
  `{ event: string; fields: Record<string, unknown> }` (payload nested under `.fields`).
- No shared test helper file exists in `tests/`. All helpers are file-local.
- The two event shapes differ (`Record<string, unknown>` flat vs. `EmittedEvent`
  structured), but a generic helper with bound `T extends { event: unknown }` covers
  both — `Record<string, unknown>`'s index signature makes all keys `unknown`; 
  `EmittedEvent.event: string` satisfies `event: unknown`.
- CLAUDE.md has no "Test conventions" section. Will insert after "Coverage policy",
  before "Structural-invariants policy".
- Reference cardinality patterns exist: `resume.test.ts:197-198`,
  `blocked.test.ts:173`, `reflection.test.ts:238-241`.

## Desired End State

- `CLAUDE.md` has a `## Test conventions` section (between "Coverage policy" and
  "Structural-invariants policy") documenting the rule with cycles 0022/0051 rationale.
- `tests/helpers.ts` exports `expectExactlyOne<T extends { event: unknown }>(events: T[], eventName: string): T`.
- `halt.test.ts` lines 122 and 190: `find` replaced with `expectExactlyOne`;
  `assert.ok(halted)` removed; downstream payload assertions unchanged.
- `reflection.test.ts` lines 77, 112, 159, 182, 257, 357: `find` replaced with
  `expectExactlyOne`; `assert.ok(summary)` / `assert.ok(summary, "...")` removed;
  `summary!.fields.*` becomes `summary.fields.*`.
- `npm test` passes, `npm run test:coverage` passes, coverage gates hold, no TypeScript warnings.

## What We're NOT Doing

- Not migrating `engine.paused` cardinality sites in `tests/engine/triage.test.ts`.
- Not migrating any event type beyond `engine.halted` and `reflection.summary`.
- Not adding a per-file coverage floor for `tests/helpers.ts` (gate only floors `src/` files).
- Not touching any production (SUT) code — test-only changes throughout.
- Not introducing any test framework beyond `node:test` + `node:assert`.

## Implementation Approach

Four sequential tasks: document → create helper → migrate halt.test.ts → migrate
reflection.test.ts. Run `npm test` after Tasks 3 and 4 to catch regressions
incrementally. Run `npm run test:coverage` in Task 5 to confirm floors hold.

---

## Task 1: Add "Test conventions" section to CLAUDE.md

### Overview
Documents the `filter().length === 1` rule so future test authors know the
convention and its rationale. Prevents regression to `find`-only existence checks.

### Changes Required

**File**: `CLAUDE.md`

Insert a new `## Test conventions` section after line 37 (end of "Coverage policy"
section), before the "## Structural-invariants policy" section:

```markdown
## Test conventions

- **Exactly-once engine events must be cardinality-pinned.** Use
  `filter(predicate).length === 1` (not `find(predicate) !== undefined`) when
  asserting that an engine event fires exactly once. A bare `find` only confirms
  existence — it lets double-emission bugs slip through undetected.
- Use the `expectExactlyOne(events, eventName)` helper from `tests/helpers.ts`
  for events where you also need the payload. It asserts `length === 1` and
  returns the matched event.
- Background: cycles 0022 and 0051 established this rule. `engine.halted` and
  `reflection.summary` are the canonical exactly-once events.
```

### Success Criteria
- [ ] `CLAUDE.md` has a `## Test conventions` section between "Coverage policy" and "Structural-invariants policy"
- [ ] Section documents the `filter().length === 1` rule and references `expectExactlyOne`
- [ ] Section cites cycles 0022 and 0051
- [ ] No TypeScript compilation impact (CLAUDE.md is not compiled)

---

## Task 2: Create `tests/helpers.ts` with `expectExactlyOne`

### Overview
Shared generic helper usable from both `halt.test.ts` (flat `Record<string, unknown>`
events) and `reflection.test.ts` (`EmittedEvent` events). The bound
`T extends { event: unknown }` covers both shapes without overloads or casts.

### Changes Required

**File**: `tests/helpers.ts` (new file)

```ts
import { strict as assert } from "node:assert";

export function expectExactlyOne<T extends { event: unknown }>(
  events: T[],
  eventName: string
): T {
  const matches = events.filter((e) => e.event === eventName);
  assert.equal(matches.length, 1, `expected exactly one "${eventName}" event, got ${matches.length}`);
  return matches[0];
}
```

Design decisions:
- Bound `T extends { event: unknown }`: `Record<string, unknown>` satisfies it (index
  signature covers all keys as `unknown`); `EmittedEvent` satisfies it (`event: string`
  extends `unknown`).
- Returns `T` — caller gets the concrete type, no downstream cast needed.
- Error message includes the actual count — mutation test failures are self-describing.

### Success Criteria
- [ ] File exists at `tests/helpers.ts`
- [ ] `npm run typecheck` passes with the new file included
- [ ] File compiles under `--experimental-strip-types` (no transpilation step)

---

## Task 3: Migrate `tests/cli/halt.test.ts` — 2 offender sites

### Overview
Import `expectExactlyOne` and replace `events.find(...)` at lines 122 and 190.
Remove the now-redundant `assert.ok(halted)` lines. Payload assertions are
unchanged — return type is inferred as `Record<string, unknown>`.

### Changes Required

**File**: `tests/cli/halt.test.ts`

**Add import** (after existing imports):
```ts
import { expectExactlyOne } from "../helpers.ts";
```

**Site 1 — line 122** (test: "two consecutive terminal failures"):
```ts
// BEFORE:
const halted = events.find((e) => e.event === "engine.halted") as Record<string, unknown>;
assert.ok(halted, "engine.halted emitted");

// AFTER:
const halted = expectExactlyOne(events, "engine.halted");
```
Downstream lines 124–127 (`halted.reason`, `halted.threshold`,
`halted.failed_cycles as string[]`) are unchanged.

**Site 2 — line 190** (test: "threshold 1 halts after one terminal failure"):
```ts
// BEFORE:
const halted = events.find((e) => e.event === "engine.halted") as Record<string, unknown>;
assert.ok(halted);

// AFTER:
const halted = expectExactlyOne(events, "engine.halted");
```
Downstream lines 192–193 (`halted.threshold`, `halted.failed_cycles`) are unchanged.

### Success Criteria
- [ ] `npm test` passes (all tests green) after this task
- [ ] `npm run typecheck` passes — no errors or warnings
- [ ] `halted.reason`, `halted.threshold`, `halted.failed_cycles` accesses still compile
- [ ] No `as Record<string, unknown>` cast remaining on the migrated lines
- [ ] No `assert.ok(halted)` remaining at either migrated site

---

## Task 4: Migrate `tests/engine/reflection.test.ts` — 6 offender sites

### Overview
Import `expectExactlyOne` and replace `events.find(...)` at all 6 offender lines.
Remove `assert.ok(summary)` / `assert.ok(summary, "...")` where present. Drop `!`
non-null assertions on `.fields.*` access — now unnecessary since `expectExactlyOne`
guarantees a defined return.

### Changes Required

**File**: `tests/engine/reflection.test.ts`

**Add import** (after line 7, after existing imports):
```ts
import { expectExactlyOne } from "../helpers.ts";
```

**Site 1 — line 77** (test: "happy path with 2 entries"):
```ts
// BEFORE (lines 77-80):
const summary = events.find((e) => e.event === "reflection.summary");
assert.ok(summary);
assert.equal(summary!.fields.count, 2);
assert.equal(summary!.fields.skipped, 0);

// AFTER:
const summary = expectExactlyOne(events, "reflection.summary");
assert.equal(summary.fields.count, 2);
assert.equal(summary.fields.skipped, 0);
```

**Site 2 — line 112** (test: "unparseable stdout escalates"):
```ts
// BEFORE (lines 112-115):
const summary = events.find((e) => e.event === "reflection.summary");
assert.ok(summary, "reflection.summary emitted on escalation");
assert.equal(summary!.fields.count, 0);
assert.equal(summary!.fields.skipped, 1);

// AFTER:
const summary = expectExactlyOne(events, "reflection.summary");
assert.equal(summary.fields.count, 0);
assert.equal(summary.fields.skipped, 1);
```

**Site 3 — line 159** (test: "leading prose + fenced JSON + trailing prose"):
```ts
// BEFORE (lines 159-162):
const summary = events.find((e) => e.event === "reflection.summary");
assert.ok(summary);
assert.equal(summary!.fields.count, 0);
assert.equal(summary!.fields.skipped, 0);

// AFTER:
const summary = expectExactlyOne(events, "reflection.summary");
assert.equal(summary.fields.count, 0);
assert.equal(summary.fields.skipped, 0);
```

**Site 4 — line 182** (test: "JSON with trailing prose"):
```ts
// BEFORE (lines 182-184):
const summary = events.find((e) => e.event === "reflection.summary");
assert.equal(summary!.fields.count, 1);
assert.equal(summary!.fields.skipped, 0);

// AFTER:
const summary = expectExactlyOne(events, "reflection.summary");
assert.equal(summary.fields.count, 1);
assert.equal(summary.fields.skipped, 0);
```
(No `assert.ok` to remove at this site.)

**Site 5 — line 257** (test: "repair-substring still invalid JSON"):
```ts
// BEFORE (lines 257-259):
const summary = events.find((e) => e.event === "reflection.summary");
assert.equal(summary!.fields.count, 0);
assert.equal(summary!.fields.skipped, 1);

// AFTER:
const summary = expectExactlyOne(events, "reflection.summary");
assert.equal(summary.fields.count, 0);
assert.equal(summary.fields.skipped, 1);
```

**Site 6 — line 357** (test: "entry with missing body is dropped"):
```ts
// BEFORE (lines 357-359):
const summary = events.find((e) => e.event === "reflection.summary");
assert.equal(summary!.fields.count, 1);
assert.equal(summary!.fields.skipped, 1);

// AFTER:
const summary = expectExactlyOne(events, "reflection.summary");
assert.equal(summary.fields.count, 1);
assert.equal(summary.fields.skipped, 1);
```

### Success Criteria
- [ ] `npm test` passes (all 482+ tests green) after this task
- [ ] `npm run typecheck` passes — no errors or warnings
- [ ] No `!` non-null assertions on `summary.fields.*` at any migrated site
- [ ] No `assert.ok(summary)` at any migrated site
- [ ] No `events.find(...)` for `reflection.summary` at any of the 6 lines

---

## Task 5: Coverage validation and mutation verification

### Overview
Run full coverage suite to confirm floors hold. Perform manual mutation testing to
confirm cardinality pins catch double-emission — do NOT commit the mutations.

### Changes Required

No code changes. Commands only.

```
npm run test:coverage
```

**Manual mutation test — `engine.halted` (revert before commit):**
Temporarily inject a second `engine.halted` emit in the halt path (e.g.,
`src/engine/run-cycle.ts`). Confirm both halt.test.ts sites at lines 122 and 190
now fail with:
```
expected exactly one "engine.halted" event, got 2
```
Revert the mutation.

**Manual mutation test — `reflection.summary` (revert before commit):**
Temporarily inject a second `reflection.summary` emit at the end of
`src/engine/reflection.ts`. Confirm all 6 reflection.test.ts sites fail with:
```
expected exactly one "reflection.summary" event, got 2
```
Revert the mutation.

### Success Criteria
- [ ] `npm run test:coverage` passes — all per-file floors intact
- [ ] `npm run check:invariants` passes
- [ ] Mutation test for `engine.halted`: both halt.test.ts sites fail, then reverted
- [ ] Mutation test for `reflection.summary`: all 6 reflection.test.ts sites fail, then reverted
- [ ] No TypeScript warnings introduced anywhere in the cycle

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] CLAUDE.md has a "Test conventions" subsection documenting the filter(...).length === 1 rule with rationale (cycles 0022/0051).` | Task 1 | New `##` section inserted between "Coverage policy" and "Structural-invariants policy" |
| `[ ] expectExactlyOne(events, eventName) helper exists, usable across both halt.test.ts and reflection.test.ts.` | Task 2 | `tests/helpers.ts` — generic bound `T extends { event: unknown }` covers both event shapes |
| `[ ] tests/cli/halt.test.ts lines 119 and 187 (engine.halted find-existence) migrated to expectExactlyOne.` | Task 3 | Actual current lines are 122 and 190 (SPEC line refs drifted ~3 lines); both sites migrated |
| `[ ] tests/engine/reflection.test.ts lines 77, 112, 159, 182, 257, 357 (reflection.summary find-existence) migrated to expectExactlyOne.` | Task 4 | All 6 sites migrated; line numbers confirmed current via direct read |
| `[ ] All downstream payload assertions on the migrated sites still pass (no behavioral regression).` | Tasks 3 & 4 | Payload access patterns preserved; `!` dropped as now structurally unnecessary |
| `[ ] npm test passes (all existing tests green).` | Task 5 | Run after Tasks 3 and 4 incrementally; final confirmation in Task 5 |
| `[ ] Coverage gates hold — no per-file floor regression.` | Task 5 | `npm run test:coverage` → `npm run check:coverage` auto-runs |
| `[ ] No TypeScript/compiler warnings introduced.` | Tasks 2, 3, 4 | `npm run typecheck` after each task |
| `[ ] All existing tests still pass.` | Task 5 | Duplicate of "npm test passes" — same coverage |
| `[ ] No compiler/linter warnings introduced.` | Tasks 2, 3, 4 | Duplicate of TypeScript warnings bullet — same coverage |

---

## Testing Strategy

### Unit Tests
- No new test files — all changes are migrations within existing test files.
- `expectExactlyOne` is exercised by 8 call sites across the two test files. The
  existing test cases covering those assertions serve as functional tests for the helper.
- Key edge cases already covered by existing tests: 0-entry summary (line 112), 1-entry
  summary (lines 182, 357), 2-entry summary (line 77), parse error (lines 112, 257),
  repair path (lines 159, 182), invalid entry drop (line 357).

### Integration / E2E Tests
- `halt.test.ts` tests are integration-level (spawn real `node dist/cycle.js run`
  subprocess). Migrated assertions verify the same behavior — only the assertion
  pattern changes, not the tested invariant.
- Manual mutation test (not committed) validates that cardinality pins actually catch
  double-emission regressions, which was the entire motivation for this cycle.

## Risk Assessment

- **TypeScript inference failure for `Record<string, unknown>` with `T extends { event: unknown }`**: Index-signature types sometimes fail generic inference. Mitigation: if `npm run typecheck` rejects the inferred `T`, add explicit type parameter `expectExactlyOne<Record<string, unknown>>(events, "engine.halted")` at the halt.test.ts call sites.
- **Line number drift between RESEARCH/SPEC and current file**: SPEC cited halt.test.ts lines 119/187; verified current lines are 122/190. Plan uses confirmed current lines. Mitigation: re-read target region before editing.
- **`tests/helpers.ts` appearing in LCOV coverage report**: New file will show up in coverage output. No per-file floor is registered for it in `scripts/coverage-gate.mjs`, so it won't trip the gate. Confirm this assumption holds after running `npm run test:coverage`.
```
