---
id: refl-0226-priority-hint-only-normalization-path-ha
title: Add test for priority_hint-only normalization path in readQueue
workflow: feature
depends_on: []
triaged_at: "2026-05-21T13:56:23.837Z"
source: triage
failed_at: "2026-05-21T18:54:53.484Z"
failed_step: build
failed_attempts: 3
last_cycle_id: "0235"
---
## Objective

Close a test coverage gap on the `priority_hint`-only normalization branch inside `readQueue` (`src/engine/queue.ts`).

## Background

The normalization pre-pass in `readQueue` resolves a row's priority via:

```typescript
o.priority ?? o.priority_hint
```

before passing the value to `normalizePriority`. This correctly handles legacy queue rows that carry `priority_hint` but no `priority` field (old format). However, cycle 0226's REVIEW confirmed no test covers this branch — only the case where both fields are present is exercised (see `tests/engine/queue.test.ts:351`). A future change to the normalization logic could silently regress the `priority_hint`-only path.

## Work Required

In `tests/engine/queue.test.ts`, add a test case that:

1. Writes a `tbd.jsonl` row containing `priority_hint: 'high'` and **no** `priority` field.
2. Calls `readQueue()` on that queue file.
3. Asserts the returned row has `priority: 'high'`.

Place the new test alongside the existing priority-normalization tests (around line 351).

## Acceptance Criteria

- New test passes and exercises the `priority_hint`-only code path.
- `npm test` passes with no regressions.
- Coverage gate passes: `src/engine/queue.ts` line coverage remains ≥ 90%.
