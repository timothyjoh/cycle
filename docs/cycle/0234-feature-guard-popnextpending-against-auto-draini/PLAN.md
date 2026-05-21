# Implementation Plan: Cycle 0234

## Overview

Add a hold gate to `popNextPending` in `src/engine/queue.ts` that filters `discuss`-priority rows from the candidate set before selection, causing the drain loop to stall (`null` return) when only `discuss` rows remain. Two tests cover the new behavior; `docs/ENGINE.md` gains a note documenting the stopgap.

## Current State (from Research)

- `popNextPending` (queue.ts:161–172) filters by `status === "pending"`, sorts by `PRIORITY_ORDER`, then scans for the first unblocked row. `discuss` has order value `4` — last but still executable.
- `PRIORITY_ORDER = { critical:0, high:1, medium:2, low:3, discuss:4 }` (queue.ts:8–10).
- Engine drain loop (cli.ts:432–433) breaks on `null` from `popNextPending` — the stall path is already wired.
- Existing test `"popNextPending: discuss is last priority"` (queue.test.ts:438–450) asserts `M` is returned over `D` — passes today due to ordering, will continue to pass after the guard but for the correct reason.
- ENGINE.md line 48 has a triage-side note on discuss; the `popNextPending` hold gate needs a separate note.
- Per-file branch floor for `src/engine/queue.ts`: ≥ 90% (coverage-gate.mjs:28).

## Desired End State

After this cycle:
- `popNextPending` contains `&& r.priority !== "discuss"` in its filter predicate, with a two-line inline comment naming the stopgap and referencing `redesign-05-discuss-folder-lifecycle`.
- `tests/engine/queue.test.ts` has the existing mixed-priority test renamed to reflect guard semantics, plus one new all-discuss stall test.
- `docs/ENGINE.md` Queue section has an additional sentence or bullet documenting the `popNextPending` hold gate as a stopgap.
- `npm test`, `npm run test:coverage`, `npm run typecheck`, and `npm run check:invariants` all pass.
- `src/engine/queue.ts` branch coverage meets ≥ 90%.

## What We're NOT Doing

- Full human-review lane (`redesign-05-discuss-folder-lifecycle`)
- `cycle status` output or CLI display changes
- Moving `discuss` rows to a separate folder or lifecycle state
- Any changes to triage routing (`parkForDiscussion`), reflection output, or `isQueueRow` validation
- Logging or event emission for the stall condition
- Any change to how `PRIORITY_ORDER` is defined

## Implementation Approach

One-line filter change in `popNextPending` with a two-line comment. The existing test covers the mixed-priority acceptance criterion; it only needs a name update. One new test covers the all-discuss stall. ENGINE.md gains a brief addendum appended to the existing `discuss` note. No mocking — all tests use real JSONL in temp directories per established queue test pattern.

**Resolved open questions:**

1. **Pre-existing "discuss is last priority" test**: Rename to `"popNextPending: discuss rows are filtered — mixed queue returns highest non-discuss"`. Body is unchanged; the rename makes the semantics honest post-change. This covers SPEC's mixed-priority acceptance criterion without a duplicate test.

2. **Inline comment placement and wording**: Two-line block immediately before the `.filter(...)` call inside `popNextPending`:
   ```typescript
   // Stopgap: discuss rows are held for human review and must not be auto-executed.
   // Full lifecycle: redesign-05-discuss-folder-lifecycle.
   ```

---

## Task 1: Filter `discuss` rows in `popNextPending`

### Overview

Add `&& r.priority !== "discuss"` to the `pending` filter in `popNextPending`, with a two-line comment documenting the stopgap intent.

### Changes Required

**File**: `src/engine/queue.ts`

Replace lines 164–166 (the `pending` assignment):

```typescript
// Before
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
```

```typescript
// After
  // Stopgap: discuss rows are held for human review and must not be auto-executed.
  // Full lifecycle: redesign-05-discuss-folder-lifecycle.
  const pending = rows
    .filter((r) => r.status === "pending" && r.priority !== "discuss")
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
```

No other changes to `popNextPending` or any other function in the file.

### Success Criteria

- [ ] `npm run typecheck` produces no errors
- [ ] `npm run build` succeeds
- [ ] Existing `popNextPending` tests still pass (spot-verify with `npm test`)

---

## Task 2: Update and extend `tests/engine/queue.test.ts`

### Overview

1. Rename the existing mixed-priority test to reflect guard semantics.
2. Add one new test: all-discuss stall → `null`.

### Changes Required

**File**: `tests/engine/queue.test.ts`

**Change 1** — rename existing test at line 438:

```typescript
// Before
test("popNextPending: discuss is last priority", async () => {
```

```typescript
// After
test("popNextPending: discuss rows are filtered — mixed queue returns highest non-discuss", async () => {
```

Test body is unchanged: writes `row("D", { priority: "discuss" })` and `row("M", { priority: "medium" })`, asserts `next?.id === "M"`. No other edits to this test.

**Change 2** — add new test after line 450 (after the existing mixed-priority test, before the "stability" test at line 452):

```typescript
test("popNextPending: returns null when all pending rows are discuss", async () => {
  const root = await setupRoot();
  try {
    await writeQueue(root, [
      row("D1", { priority: "discuss" }),
      row("D2", { priority: "discuss" }),
    ]);
    const next = await popNextPending(root);
    assert.equal(next, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

This follows the exact pattern of existing tests (setupRoot, writeQueue, popNextPending, assert, rm in finally).

### Success Criteria

- [ ] Both new/updated tests appear under `popNextPending:` test group
- [ ] `npm test` passes — all existing tests plus two updated/new tests green
- [ ] `npm run test:coverage` passes
- [ ] `src/engine/queue.ts` branch coverage ≥ 90% confirmed in LCOV output

---

## Task 3: Update `docs/ENGINE.md`

### Overview

Extend the Queue section's existing `discuss` note (line 48) with a sentence documenting the `popNextPending` hold gate and its stopgap status.

### Changes Required

**File**: `docs/ENGINE.md`

At line 48, the existing note reads:

```
**Note on `discuss` priority:** Raws with `priority: discuss` are routed to `docs/cycle/issues/discuss/` by the triage loop before the agent is called — they are never queued. See [Triage subroutine](#triage-subroutine) and RFC-001 § 3 Discuss for the release mechanism.
```

Replace with:

```
**Note on `discuss` priority:** Raws with `priority: discuss` are routed to `docs/cycle/issues/discuss/` by the triage loop before the agent is called — they are never queued. See [Triage subroutine](#triage-subroutine) and RFC-001 § 3 Discuss for the release mechanism. As a secondary stopgap, `popNextPending` also filters `discuss`-priority rows from the candidate set; if all remaining pending rows carry `priority: "discuss"`, `popNextPending` returns `null` and the drain loop stalls cleanly. `discuss` rows remain in `tbd.jsonl` with `status: "pending"` — they are not removed. This guard is a stopgap until `redesign-05-discuss-folder-lifecycle` delivers the full human-review lane.
```

### Success Criteria

- [ ] ENGINE.md renders without broken links or formatting issues
- [ ] The note accurately describes both the triage guard and the `popNextPending` guard
- [ ] References `redesign-05-discuss-folder-lifecycle` by name

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] popNextPending returns null when the only pending rows have priority: "discuss"` | Task 2 | All-discuss stall test asserts `next === null` |
| `[ ] popNextPending returns the highest-priority non-discuss row when pending rows include both discuss and non-discuss priorities` | Task 2 | Existing test renamed; body unchanged, asserts `M` returned |
| `[ ] discuss rows are not removed from the queue — they remain with status: "pending" after popNextPending is called` | Task 2 | All-discuss stall test: writeQueue writes two discuss rows, calls popNextPending once, does not assert removal — rows persist in JSONL; Task 1 filter does not call any write/delete |
| `[ ] New tests in tests/queue.test.ts cover both cases above and pass` | Task 2 | Renamed test + new all-discuss stall test |
| `[ ] npm test passes with no regressions` | Tasks 1–3 | Verified after each task |
| `[ ] npm run test:coverage passes; src/engine/queue.ts branch coverage meets the ≥ 90% per-file floor` | Tasks 1–2 | New filter branch covered by both stall test (false path) and mixed test (true path) |
| `[ ] npm run typecheck produces no errors or warnings` | Task 1 | Single-line predicate change; no new type surface |

---

## Testing Strategy

### Unit Tests

- **All-discuss stall** (new): two `discuss`-priority pending rows → `popNextPending` returns `null`. Covers the `priority !== "discuss"` filter predicate false branch.
- **Mixed-priority guard** (renamed existing): one `discuss` + one `medium` → `M` returned. Covers the filter predicate true branch.
- No mocking. Real JSONL files in `mkdtemp` temp dirs, cleaned up in `finally`.
- Filter predicate has two branches (discuss → excluded, non-discuss → included); both are exercised across the two tests, satisfying the ≥ 90% branch floor.

### Integration / E2E Tests

No integration tests added. The engine drain loop call site (cli.ts:432–433) already handles `null` as its stall path — that path is exercised by existing engine halt tests. No new drain-loop behavior is introduced.

## Risk Assessment

- **Coverage regression**: Adding the `priority !== "discuss"` filter introduces one new boolean branch. Both paths are explicitly covered by the stall test (all-discuss → filter excludes everything → null) and the renamed mixed test (medium row passes filter → returned). Risk: low.
- **Existing test meaning drift**: The renamed test previously described ordering semantics; after the guard, the same assertion holds for different reasons. Renaming the test prevents future readers from misunderstanding the implementation. Risk of confusion if not renamed: moderate; addressed by Task 2.
- **discuss rows silently accumulating**: The guard stalls the drain loop when only discuss rows remain; they stay in `tbd.jsonl` indefinitely. This is the intended behavior per SPEC but creates a permanent stall if a queue is seeded with only discuss rows and no human intervention. Documented in ENGINE.md; no runtime mitigation added (out of scope).
