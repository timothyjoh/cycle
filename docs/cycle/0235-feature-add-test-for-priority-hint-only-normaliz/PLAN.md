# Implementation Plan: Cycle 0235

## Overview

Add one focused test to `tests/engine/queue.test.ts` covering the `priority_hint`-only normalization branch in `readQueue` — the path where a queue row carries `priority_hint` but no `priority` field.

## Current State (from Research)

- `src/engine/queue.ts:84`: `o.priority = normalizePriority(o.priority ?? o.priority_hint)` — the `??` fallback to `priority_hint` is the uncovered branch.
- `src/engine/queue.ts:85`: `delete o.priority_hint` — must be asserted absent.
- Two existing normalization tests at lines 378–419 cover: (1) numeric priority wins over `priority_hint`, (2) no priority field defaults to `"medium"`. Neither hits the `priority_hint`-only branch.
- All required imports (`writeFile`, `join`, `rm`, `readQueue`, `assert`, `test`) are already present in the test file.
- `setupRoot()` helper at line 22–26 and the raw JSONL write pattern at line 378–399 are the exact pattern to follow.
- Placement: inside the `// readQueue normalization tests` block, after line 419, before the `// popNextPending priority sort tests` block at line 421.

## Desired End State

`tests/engine/queue.test.ts` contains a third normalization test immediately after line 419. `npm test` and `npm run test:coverage` pass with `src/engine/queue.ts` line coverage ≥ 90%. The `priority_hint`-only branch at line 84 is exercised.

## What We're NOT Doing

- No changes to `src/engine/queue.ts` production code.
- No changes to any other test file.
- No testing of other normalization branches (already covered).
- No new imports, helpers, or infrastructure.

## Implementation Approach

Insert one `test(...)` block after the existing `readQueue: row missing priority gets normalized to medium` test (line 419) and before the `// popNextPending priority sort tests` comment (line 421). Follow the identical structure of the test at lines 378–399: raw JSONL write → `readQueue` call → assertions → `finally` cleanup.

---

## Task 1: Add priority_hint-only normalization test

### Overview

Insert one test immediately after line 419 in `tests/engine/queue.test.ts`. The test writes a raw JSONL row with `priority_hint: "high"` and no `priority` field, calls `readQueue(root)`, and asserts the returned row has `priority === "high"` and no `priority_hint` field.

### Changes Required

**File**: `tests/engine/queue.test.ts`

**Insert after line 419** (after the closing `});` of the `readQueue: row missing priority gets normalized to medium` test, before the `// popNextPending priority sort tests` comment):

```typescript
test("readQueue: priority_hint-only row is normalized to priority field", async () => {
  const root = await setupRoot();
  try {
    const line = JSON.stringify({
      id: "Z",
      title: "Z title",
      status: "pending",
      attempt: 0,
      depends_on: [],
      triaged_at: "2026-05-13T10:00:00Z",
      priority_hint: "high",
    });
    await writeFile(join(root, ".cycle/tbd.jsonl"), line + "\n", "utf8");
    const rows = await readQueue(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].priority, "high");
    assert.ok(!("priority_hint" in rows[0]), "priority_hint should be stripped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria

- [ ] Test named `readQueue: priority_hint-only row is normalized to priority field` exists in `tests/engine/queue.test.ts`
- [ ] `assert.equal(rows[0].priority, "high")` assertion present
- [ ] `assert.ok(!("priority_hint" in rows[0]), ...)` assertion present
- [ ] `npm test` passes with no regressions
- [ ] `npm run test:coverage` passes with `src/engine/queue.ts` line coverage ≥ 90%

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] New test named `readQueue: priority_hint-only row is normalized to priority field` (or equivalent descriptive name) exists in `tests/engine/queue.test.ts`` | Task 1 | Exact name used |
| `[ ] Test asserts `row.priority === 'high'` for a row written with only `priority_hint: 'high'`` | Task 1 | `assert.equal(rows[0].priority, "high")` |
| `[ ] Test asserts the returned row has no `priority_hint` field (the field is deleted by `readQueue`)` | Task 1 | `assert.ok(!("priority_hint" in rows[0]), ...)` |
| `[ ] `npm test` passes with no regressions` | Task 1 | Verified by running `npm test` |
| `[ ] `npm run test:coverage` passes with `src/engine/queue.ts` line coverage ≥ 90%`` | Task 1 | Verified by running `npm run test:coverage` |

---

## Testing Strategy

### Unit Tests

- Single test exercising the `priority_hint`-only branch: row has `priority_hint: "high"`, no `priority` field.
- Two assertions: `priority === "high"` (normalization applied), `"priority_hint" not in row` (field deleted).
- Real filesystem — no mocking. Matches all existing queue tests; `node:fs/promises` mocking is explicitly prohibited by `CLAUDE.md`.

### Integration / E2E Tests

No additional integration tests required. The existing `npm test` suite serves as the regression gate.

## Risk Assessment

- **`isQueueRow` guard rejects row before normalization**: RESEARCH confirms normalization (line 84) runs before `isQueueRow` (line 87), so a `priority_hint`-only row will pass the guard after normalization sets `priority`. No risk.
- **Coverage regression**: Adding a test can only increase coverage. No risk of dropping below the 90% floor.
