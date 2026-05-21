# SPEC — Cycle 0235: Add Test for priority_hint-Only Normalization Path in readQueue

## Objective

This cycle closes a test coverage gap in `readQueue` (`src/engine/queue.ts`). The normalization pre-pass resolves a row's priority via `o.priority ?? o.priority_hint` before calling `normalizePriority`. The `priority_hint`-only branch — legacy queue rows that carry `priority_hint` but no `priority` field — has no test coverage. A regression in this path would go undetected. This cycle adds a focused test that exercises the branch and locks in the expected behavior.

## Source Issue

`refl-0226-priority-hint-only-normalization-path-ha` — "Add test for priority_hint-only normalization path in readQueue"

## Scope

### In Scope
- One new test in `tests/engine/queue.test.ts` covering the `priority_hint`-only normalization path in `readQueue`

### Out of Scope
- Changes to `src/engine/queue.ts` production code
- Testing other normalization branches (already covered)
- Changes to any other test file

## Requirements

- The new test writes a `tbd.jsonl` row with `priority_hint: 'high'` and no `priority` field
- The test calls `readQueue()` on that queue file
- The test asserts the returned row has `priority: 'high'` (string equality)
- The test is placed alongside the existing priority-normalization tests (around line 378 in `tests/engine/queue.test.ts`)
- The written row must otherwise be a valid queue row (id, title, status, attempt, depends_on, triaged_at) so it passes `isQueueRow`

## Acceptance Criteria

- [ ] New test named `readQueue: priority_hint-only row is normalized to priority field` (or equivalent descriptive name) exists in `tests/engine/queue.test.ts`
- [ ] Test asserts `row.priority === 'high'` for a row written with only `priority_hint: 'high'`
- [ ] Test asserts the returned row has no `priority_hint` field (the field is deleted by `readQueue`)
- [ ] `npm test` passes with no regressions
- [ ] `npm run test:coverage` passes with `src/engine/queue.ts` line coverage ≥ 90%

## Testing Strategy

- Node built-in test runner (`node:test`) — matches existing suite
- Use `setupRoot()` helper from the existing test file to create a temp directory
- Write a raw JSONL line (via `writeFile` or `appendFile`) containing a row with `priority_hint` but no `priority`; call `readQueue(root)`; assert result
- Clean up temp root in `finally` block, consistent with surrounding tests

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No changes — no new conventions introduced
- **README.md**: No changes — internal test coverage fix, not user-facing

## Dependencies

- `tests/helpers.ts` `setupRoot` helper must exist (already present in the test file)
- `src/engine/queue.ts` `readQueue` and related exports must be importable (already the case)
