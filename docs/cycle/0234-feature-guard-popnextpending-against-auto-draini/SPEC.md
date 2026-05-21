# SPEC — Cycle 0234: Guard popNextPending Against Auto-Draining Discuss-Priority Rows

## Objective
This cycle adds a hold gate to `popNextPending` in `src/engine/queue.ts` so that rows with `priority: "discuss"` are never auto-executed by the engine. The redesign-05 intent is that `discuss` means "needs human decision before work begins," but the current implementation places `discuss` last in `PRIORITY_ORDER` (value `4`) and executes it automatically when no higher-priority pending rows exist. The fix filters `discuss` rows out of the candidate set entirely, causing the queue to stall — returning `null` — when only `discuss` rows remain. This is explicitly scoped as a stopgap until `redesign-05-discuss-folder-lifecycle` delivers the full human-review lane.

## Source Issue
`refl-0226-discuss-priority-rows-auto-drain-without` — "Guard popNextPending against auto-draining discuss-priority rows"

## Scope

### In Scope
- Modify `popNextPending` in `src/engine/queue.ts` to filter out `discuss`-priority rows before selecting the next candidate
- Add tests in `tests/queue.test.ts` covering the two new guard behaviors: all-discuss stall and mixed-priority skip

### Out of Scope
- Full human-review lane (`redesign-05-discuss-folder-lifecycle`)
- CLI changes or `cycle status` output changes
- Moving `discuss` rows to a separate folder or lifecycle state
- Any changes to how `discuss` rows are written or triaged

## Requirements
- `popNextPending` must filter `discuss`-priority rows from the sorted candidate list before selecting the next row to return
- When all pending rows have `priority: "discuss"`, `popNextPending` returns `null`
- When pending rows contain a mix of `discuss` and non-discuss priorities, `popNextPending` returns the highest-priority non-discuss row
- `discuss` rows must remain in the queue (still counted in `cycle status` pending counts); the guard skips but does not remove them
- Guard behavior documented with an inline comment noting it is a stopgap for `redesign-05-discuss-folder-lifecycle`

## Acceptance Criteria
- [ ] `popNextPending` returns `null` when the only pending rows have `priority: "discuss"`
- [ ] `popNextPending` returns the highest-priority non-discuss row when pending rows include both discuss and non-discuss priorities
- [ ] `discuss` rows are not removed from the queue — they remain with `status: "pending"` after `popNextPending` is called
- [ ] New tests in `tests/queue.test.ts` cover both cases above and pass
- [ ] `npm test` passes with no regressions
- [ ] `npm run test:coverage` passes; `src/engine/queue.ts` branch coverage meets the ≥ 90% per-file floor
- [ ] `npm run typecheck` produces no errors or warnings

## Testing Strategy
- Framework: `node:test` with the existing helpers in `tests/helpers.ts`
- Extend `tests/queue.test.ts` with two new test cases:
  - **All-discuss stall**: write a queue with one or more `pending` rows all having `priority: "discuss"`; assert `popNextPending` returns `null`
  - **Mixed-priority skip**: write a queue with one `discuss` row and one non-discuss (`medium` or `high`) row both pending; assert `popNextPending` returns the non-discuss row and does not return the discuss row
- No filesystem mocking needed — existing queue test helpers write real JSONL files in a temp directory

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention or command changes required
- **docs/ENGINE.md**: Add a note under queue drain behavior documenting that `discuss`-priority rows are held and not auto-executed; note the stopgap status and reference `redesign-05-discuss-folder-lifecycle` as the follow-on

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/queue.ts` `popNextPending` function and `PRIORITY_ORDER` constant (already exist)
- `tests/queue.test.ts` and `tests/helpers.ts` (already exist)
- No external services or env vars required
