# Implementation Plan: Cycle 0226

## Overview

Replace the two-field numeric priority system (`priority: 1–10` / `priority_hint`) with a `Priority` string enum (`low | medium | high | critical | discuss`) and add deterministic engine-side priority sort with topological clamp to `popNextPending`. After this cycle the engine owns drain order — `critical → high → medium → low → discuss` — stable within each tier, with dependents blocked behind their targets regardless of priority tier.

## Current State (from Research)

- `QueueRow` has no `priority` field; `isQueueRow` does not validate one.
- `readQueue` returns rows verbatim with no normalization; `popNextPending` is pure FIFO with no dependency check.
- `rewriteOrdering` (triage) rewrites `tbd.jsonl` in agent-specified order after each triage pass; engine-side sort will compose on top of this at drain time.
- Triage `applyRaw` constructs `QueueRow` and todo frontmatter without a `priority` field; `raw.fm.priority` is parsed but unused.
- `materializeFreeformIssue` emits `priority: 3` (numeric) by default; `DropArgs.priority: number`; `parse-args.ts` accepts integers 1–10.
- `src/engine/queue.ts` is not in the `FLOORS` table in `scripts/coverage-gate.mjs`.

## Desired End State

- `Priority` type exported from `src/engine/queue.ts`; `QueueRow.priority: Priority` present on every row.
- `readQueue` normalizes legacy numeric `priority` / `priority_hint` before the `isQueueRow` guard.
- `popNextPending` sorts pending rows by priority tier then applies topological clamp before picking the first eligible row.
- Triage emits `priority` in each child's todo frontmatter and `QueueRow`; defaults absent raw field to `'medium'`.
- `cycle drop` always emits `priority: 'medium'`; numeric `--priority` flag removed.
- CLAUDE.md, RFC-001, ENGINE.md updated to reflect enum values and sort-order guarantee.
- `src/engine/queue.ts` floor added at 90% in `scripts/coverage-gate.mjs`.

**Verification**: `npm test` passes; `npm run test:coverage && npm run check:coverage` green; `npm run check:invariants` green.

## What We're NOT Doing

- `discuss` folder lifecycle (redesign-05).
- Reflection three-bucket rewrite (redesign-07).
- Adding an enum-based `--priority` flag to `cycle drop` — that is a separate future cycle.
- A persistent migration script for `tbd.jsonl` — runtime normalization at `readQueue` is sufficient.
- Adding `priority` to `TriageChild` or requiring the triage agent to emit it — `applyRaw` reads `raw.fm.priority` directly.

## Implementation Approach

Sort is placed inside `popNextPending`, not `readQueue`. This keeps `readQueue` as a pure disk-reader and leaves `rewriteOrdering` unaffected (it re-sorts by agent ordering anyway). The topological clamp is implemented in the same `popNextPending` pass: after priority-sorting, iterate and skip any pending row whose `depends_on` contains an id still present in the queue (any status). This also implements the RFC-001 §6 dependency gate that was previously absent. Priority propagation in triage reads `raw.fm.priority` inside `applyRaw` — no agent contract change, no `validateOutput` modification. The numeric `--priority` CLI flag is removed entirely rather than migrated; the enum-based flag is a future cycle.

---

## Task 1: Add `Priority` type, normalization, sort, and topological clamp in `src/engine/queue.ts`

### Overview

Foundational layer. Exports `Priority`, extends `QueueRow` and `isQueueRow`, adds `normalizePriority` for legacy read-time conversion, and rewrites `popNextPending` to sort by priority and enforce dependency ordering.

### Changes Required

**File**: `src/engine/queue.ts`

**Add `Priority` type and tier map** (after `QueueRowStatus`):
```typescript
export type Priority = 'low' | 'medium' | 'high' | 'critical' | 'discuss';

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0, high: 1, medium: 2, low: 3, discuss: 4,
};
```

**Add `normalizePriority(raw: unknown): Priority`** (exported):
```typescript
export function normalizePriority(raw: unknown): Priority {
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'critical' || raw === 'discuss') return raw;
  // Legacy numeric: 7-10 → critical, 5-6 → high, 3-4 → medium, 1-2 → low
  if (typeof raw === 'number') {
    if (raw >= 7) return 'critical';
    if (raw >= 5) return 'high';
    if (raw >= 3) return 'medium';
    return 'low';
  }
  return 'medium'; // absent or unrecognized → default
}
```

**Extend `QueueRow`**: add `priority: Priority`.

**Update `isQueueRow`**: after existing checks, add:
```typescript
if (obj.priority !== 'low' && obj.priority !== 'medium' && obj.priority !== 'high' &&
    obj.priority !== 'critical' && obj.priority !== 'discuss') return false;
```

**Update `readQueue`**: before `isQueueRow(parsed)`, add a normalization pre-pass on the mutable parsed object:
```typescript
if (parsed && typeof parsed === 'object') {
  const o = parsed as Record<string, unknown>;
  o.priority = normalizePriority(o.priority ?? o.priority_hint);
  delete o.priority_hint;
}
```

**Rewrite `popNextPending`**:
```typescript
export async function popNextPending(repoRoot: string): Promise<QueueRow | null> {
  const rows = await readQueue(repoRoot);
  const allIds = new Set(rows.map((r) => r.id));
  const pending = rows
    .filter((r) => r.status === 'pending')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  for (const row of pending) {
    const blocked = row.depends_on.some((dep) => allIds.has(dep) && dep !== row.id);
    if (!blocked) return row;
  }
  return null;
}
```

Note: `dep !== row.id` prevents self-referential depends_on from blocking a row. `allIds` includes in_progress rows, so a row depending on an in_progress parent correctly waits.

**File**: `scripts/coverage-gate.mjs`

Add to `FLOORS`:
```javascript
"src/engine/queue.ts": 90,
```

**File**: `tests/engine/coverage-gate.test.ts` (update fixture constants)

The ALL_PASSING and related fixture maps must include `"src/engine/queue.ts"` wherever the FLOORS keys are enumerated in test fixtures. Follow the same pattern used when adding `dot-env.ts` in cycle 0225.

### Success Criteria

- [ ] `Priority` type exported and importable from `src/engine/queue.ts`
- [ ] `normalizePriority(8)` returns `'critical'`; `normalizePriority(6)` returns `'high'`; `normalizePriority(3)` returns `'medium'`; `normalizePriority(2)` returns `'low'`; `normalizePriority(undefined)` returns `'medium'`
- [ ] `isQueueRow` rejects a row with `priority: 5` (numeric) and accepts `priority: 'high'`
- [ ] `readQueue` with a JSONL file containing `priority: 3` and `priority_hint: "high"` returns normalized rows with no `priority_hint` field
- [ ] `popNextPending` returns a `critical` row before a `high` row when both are pending
- [ ] `popNextPending` skips a `high`-priority pending row when its `depends_on` contains a `low`-priority pending row, and returns the `low` row first
- [ ] Stability test: two `medium` rows preserve insertion order after sort
- [ ] `npm run check:coverage` passes with new `src/engine/queue.ts` floor

---

## Task 2: Triage priority propagation in `src/engine/triage.ts`

### Overview

Wire `raw.fm.priority` into each child's todo frontmatter and `QueueRow` inside `applyRaw`. Import `normalizePriority` from `queue.ts`.

### Changes Required

**File**: `src/engine/triage.ts`

Add import:
```typescript
import { ..., normalizePriority } from "./queue.ts";
```

**In `applyRaw`**, before the `for (const child of children)` loop, compute:
```typescript
const priority = normalizePriority((raw.fm as Record<string, unknown>).priority);
```

Inside the loop, add `priority` to `fm`:
```typescript
const fm: Frontmatter = {
  id: child.id,
  title: child.title,
  workflow: child.workflow,
  depends_on: child.depends_on,
  triaged_at: triagedAt,
  source: 'triage',
  priority,                 // ← add
};
```

Add `priority` to the `QueueRow` construction:
```typescript
const row: QueueRow = {
  id: child.id,
  title: child.title,
  status: 'pending',
  attempt: 0,
  depends_on: child.depends_on,
  triaged_at: triagedAt,
  priority,                 // ← add
};
```

### Success Criteria

- [ ] Triage test: raw issue frontmatter contains `priority: critical` → child todo file has `priority: critical`; child `QueueRow.priority === 'critical'`
- [ ] Triage test: raw issue frontmatter has no `priority` field → child todo file has `priority: medium`; child `QueueRow.priority === 'medium'`
- [ ] Existing triage test suite still passes (no existing test asserts absence of `priority` in todo or row)
- [ ] `npm run typecheck` clean

---

## Task 3: Remove numeric `--priority` from `cycle drop`; update `materializeFreeformIssue`

### Overview

`cycle drop` always emits `priority: 'medium'`. The numeric `--priority` flag is removed. `materializeFreeformIssue` drops its `priority` parameter. Tests updated accordingly.

### Changes Required

**File**: `src/issue/materialize.ts`

Remove `priority: number = 3` parameter. Emit `priority: medium` unconditionally:
```typescript
export async function materializeFreeformIssue(
  text: string,
  repoRoot: string,
  now: Date = new Date(),
) {
  // ...
  const frontmatter = [
    "---",
    `id: ${id}`,
    "source: text",
    `title: "${text.replace(/"/g, '\\"')}"`,
    `added_at: ${now.toISOString()}`,
    "triage_attempts: 0",
    "priority: medium",
    "---", "", text, "",
  ].join("\n");
  // ...
}
```

**File**: `src/cli/parse-args.ts`

- Remove `priority: number` from `DropArgs` type
- Remove `--priority` option from `nodeParseArgs` call for `drop`
- Remove the priority parsing/validation block (`let priority = 3; if (values.priority !== undefined) { ... }`)
- Remove `priority` from the returned `DropArgs` object
- Update the usage string in the catch block error message

**File**: `src/cli.ts` (line 88)

Remove the `args.priority` argument from the `materializeFreeformIssue` call:
```typescript
const { path, id } = await materializeFreeformIssue(args.text, cwd, new Date());
```

**File**: `tests/issue/materialize.test.ts`

- Test 1: update expected frontmatter from `priority: 3` to `priority: medium`
- Test 2 ("writes explicit priority"): replace with a test that confirms the function signature accepts exactly 3 args and still emits `priority: medium`

**File**: `tests/cli/drop-priority.test.ts`

Replace both existing tests with:
- Test 1: `cycle drop "foo bar"` (no flag) → exit 0, emitted file has `priority: medium` (string), no numeric priority field
- Test 2: `cycle drop "foo" --priority high` → non-zero exit, stderr matches `/unknown option/` or similar (flag no longer recognized)

**File**: `tests/cli/parse-args.test.ts`

Remove or update any test that passes `--priority N` (integer) to `drop` or expects `priority: number` in parsed args.

### Success Criteria

- [ ] `materializeFreeformIssue("x", root)` (3-arg call) compiles and emits `priority: medium`
- [ ] `npm run typecheck` clean — no TS errors from removed `priority` field on `DropArgs`
- [ ] `cycle drop "foo"` (binary) exits 0 and produced file matches `/^priority: medium$/m`
- [ ] `cycle drop "foo" --priority high` exits non-zero (unknown option)
- [ ] No test asserts `priority: 3` or `priority: 5` (numeric) anywhere

---

## Task 4: Documentation updates

### Overview

Update the three documents referenced in the SPEC to reflect enum values, triage default, and engine-side sort-order guarantee.

### Changes Required

**File**: `CLAUDE.md`

In the "Coverage policy" section, update the per-file floors bullet to include `src/engine/queue.ts` (90%).

Locate any prose referencing "priority 1–10" or numeric priority and replace with enum language. Specifically, search for `priority` references in the workflow defaults section and update to name `low | medium | high | critical | discuss`.

**File**: `docs/RFC-001-issue-lifecycle.md`

Locate §3 (raw issue frontmatter) and §"Raw drop" / `cycle drop` description. Replace:
- Numeric priority description (1–10) → enum values `low | medium | high | critical | discuss`
- "`cycle drop` emits `priority: 3` by default" → "`cycle drop` emits `priority: medium` by default"
- Remove any reference to `priority_hint` as an input field (it is still read from reflection output but normalized away at read time)

**File**: `docs/ENGINE.md`

In the queue drain section, add a sort-order note:

> **Priority sort**: `popNextPending` sorts pending rows by priority tier before selecting the next row: `critical → high → medium → low → discuss`. Sort is stable — rows within the same tier drain in `triaged_at` insertion order. **Topological clamp**: a pending row is skipped if any id in its `depends_on` list is still present in the queue (pending or in_progress), regardless of the blocked row's own priority tier.

### Success Criteria

- [ ] CLAUDE.md per-file floors list includes `src/engine/queue.ts: 90%`
- [ ] CLAUDE.md has no remaining reference to numeric priority scale
- [ ] RFC-001 priority description uses `low | medium | high | critical | discuss` language
- [ ] RFC-001 `cycle drop` default is `medium` (string), not `3`
- [ ] ENGINE.md queue drain section contains the sort-order note with topological clamp explanation

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Priority` type (`'low' \| 'medium' \| 'high' \| 'critical' \| 'discuss'`) is exported from `src/engine/queue.ts` | Task 1 | |
| `[ ] QueueRow` type carries `priority: Priority`; `isQueueRow` guard rejects rows with invalid or missing `priority` | Task 1 | |
| `[ ] todo/` frontmatter produced by triage carries a `priority` field | Task 2 | |
| `[ ] Triage defaults an absent `priority` in the raw issue to `'medium'` and emits it per child | Task 2 | |
| `[ ] Engine sorts pending rows `critical → high → medium → low`, `discuss` last; sort is stable within each tier | Task 1 | Implemented in `popNextPending` |
| `[ ] A test covers the topological clamp: a `high`-priority child depending on a `low`-priority parent runs after the parent | Task 1 | Test in `queue.test.ts` |
| `[ ] cycle drop` with no `--priority` flag produces `priority: 'medium'` in the emitted file (numeric `3` default absent) | Task 3 | |
| `[ ] Numeric → enum migration tests pass: `8 → 'critical'`, `6 → 'high'`, `3 → 'medium'`, `2 → 'low'`, missing → `'medium'` | Task 1 | `normalizePriority` unit tests |
| `[ ] priority_hint` field stripped from rows after normalization | Task 1 | `delete o.priority_hint` in `readQueue` pre-pass |
| `[ ] CLAUDE.md and RFC-001 priority references updated to enum; `docs/ENGINE.md` has sort-order note | Task 4 | |
| `[ ] scripts/coverage-gate.mjs` `FLOORS` table updated for any new module | Task 1 | `src/engine/queue.ts` at 90%; no new module created |
| `[ ] All existing tests still pass; coverage does not decrease vs. master baseline | Tasks 1–4 | Verified by `npm test` + `npm run check:coverage` |

---

## Testing Strategy

### Unit Tests

**`tests/engine/queue.test.ts`** — extend the `row()` factory to include `priority: 'medium'` as the default. Add test groups:

- `normalizePriority`: `normalizePriority(10)` → `'critical'`; `normalizePriority(8)` → `'critical'`; `normalizePriority(6)` → `'high'`; `normalizePriority(5)` → `'high'`; `normalizePriority(4)` → `'medium'`; `normalizePriority(3)` → `'medium'`; `normalizePriority(2)` → `'low'`; `normalizePriority(1)` → `'low'`; `normalizePriority(undefined)` → `'medium'`; `normalizePriority(null)` → `'medium'`; `normalizePriority('critical')` → `'critical'` (passthrough); `normalizePriority('discuss')` → `'discuss'`.
- `isQueueRow` with invalid priority: `{ ...validRow, priority: 5 }` returns false; `{ ...validRow, priority: undefined }` returns false.
- `readQueue` normalization: write a JSONL line with `priority: 3, priority_hint: "high"` → `readQueue` returns row with `priority: 'medium'` and no `priority_hint` field.
- `popNextPending` priority sort: write `[medium, critical, low, high]` pending rows → `popNextPending` returns `critical`.
- `popNextPending` stability: two `medium` rows in insertion order A then B → A returned first.
- `popNextPending` `discuss` last: `discuss` pending with `medium` pending → `medium` returned first.
- `popNextPending` topological clamp: `high` child with `depends_on: ['parent-id']`; `low` parent with `depends_on: []`; both pending → `popNextPending` returns parent.
- `popNextPending` clamp with in_progress parent: parent is `in_progress`, child is `high` pending with `depends_on: ['parent-id']` → returns null (child blocked, in_progress parent not eligible).
- Existing `popNextPending` FIFO / in_progress skip tests still pass.

**`tests/issue/materialize.test.ts`**: update both tests as described in Task 3.

**`tests/cli/parse-args.test.ts`**: remove/update `--priority` integer tests.

### Integration / E2E Tests

**`tests/cli/drop-priority.test.ts`**: replace with two tests per Task 3 — default emits `priority: medium`; `--priority` flag now causes non-zero exit.

**`tests/engine/triage.test.ts`** (or a new `triage-priority.test.ts`): two tests per Task 2 — explicit `priority: critical` in raw → todo and QueueRow carry `critical`; absent priority → `medium` in both.

**`tests/engine/coverage-gate.test.ts`**: update fixture constants (ALL_PASSING map and related fixtures) to include `"src/engine/queue.ts"` following the same pattern used when `dot-env.ts` was added in cycle 0225.

### Anti-Mock Bias

All queue tests use real tmpdir fixtures with actual JSONL writes — no mocking of `readQueue` or `writeQueue`. Triage priority tests use the existing `setupRepo`/`makeConfig`/`makeLog`/`rawBody` fixture pattern with a real tmp filesystem. The `cycle drop` E2E tests spawn the real built binary against a real tmpdir, same as the existing `drop-priority.test.ts` pattern.

## Risk Assessment

- **`row()` factory change breaks all existing queue tests**: Every test that calls `row()` without specifying `priority` will fail `isQueueRow` after the guard update. Mitigation: set `priority: 'medium'` as the default in `row()` before updating `isQueueRow`. The factory change must land in the same commit as the type change.
- **`rewriteOrdering` test fixtures**: triage tests that call `applyRaw` indirectly will produce rows with `priority` now; any test doing `deepEqual` on a full row object must be updated. Mitigation: audit triage tests for `deepEqual` on `QueueRow` objects during Task 2.
- **coverage-gate test fixture gap**: adding `src/engine/queue.ts` to FLOORS without updating `coverage-gate.test.ts` fixtures causes that test to fail. Mitigation: treat the coverage-gate fixture update as a required step in Task 1, not optional.
- **`popNextPending` clamp blocks all rows**: if every pending row has unsatisfied deps, `popNextPending` returns null and the engine sees an empty queue. This is correct behavior (engine waits), but existing tests that write rows with `depends_on: []` are unaffected. Ensure at least one test exercises the all-blocked case to confirm null return rather than an infinite loop.
