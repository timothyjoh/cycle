# SPEC — Cycle 0017: BB-6 propagateBlocked + Engine-Wide Halt Policy

## Objective
Replace the engine's current "halt on first failure" behavior with the RFC-001 §§7–8 model: a deterministic `propagateBlocked(failedId)` graph walk that moves dependents to `blocked/`, plus a `consecutive_failures` counter that halts the engine only after `engine.max_consecutive_failures` cycles in a row exhaust their attempts. Successful cycles reset the counter; isolated failures no longer stop the queue.

## Source Issue
`txt-20260513-034426-bb-6-propagateblocked-engine-wide-halt-p` — "BB-6: propagateBlocked + engine-wide halt policy."

## Scope

### In Scope
- Implement `propagateBlocked(repoRoot, failedId, log)` in `src/engine/blocked.ts`: walk `tbd.jsonl`, for each row whose `depends_on` includes `failedId` move `todo/<id>.md → blocked/<id>.md` with `blocked_by:[failedId, …]` frontmatter, drop the row, emit `issue.blocked`, and recurse on `row.id`. Returns the flat list of newly blocked ids (including transitive).
- Rewire the failure path in `src/cli.ts` to use a `consecutive_failures` counter: increment on cycle-move-to-`failed/`, reset to 0 on cycle-move-to-`done/`, halt with `engine.halted` (carrying the failed cycle ids) and exit non-zero when the counter reaches `engine.max_consecutive_failures` from `workflows.yml` (default 2). A resume-time terminal failure (RFC §11 edge case) counts the same way.

### Out of Scope
- Reflection step (BB-7).
- LLM-driven blocking decisions ("could this still work?") — RFC explicitly defers.
- Re-triaging or auto-unblocking of `blocked/` items (humans move them back to `raw/` manually).
- Changes to per-cycle `max_cycle_attempts` semantics — BB-3 already owns the per-row attempt counter and terminal-failure file move.

## Requirements
- `propagateBlocked` is pure deterministic logic, no agent spawn, no LLM call.
- Recursion is breadth-first or depth-first; either is acceptable as long as every transitive dependent ends in `blocked/` with `blocked_by` capturing the chain that reached `failedId` (e.g., direct dependents get `[failedId]`; their dependents get `[failedId, intermediateId]` or `[intermediateId]` — pick one and document).
- Mutations are applied to `tbd.jsonl` and the filesystem atomically per row (tmp-write + rename), matching the pattern used by `queue.ts` / `triage.ts`. Partial failure must leave `tbd.jsonl` and `todo/`/`blocked/` consistent.
- `propagateBlocked` is idempotent on no-op (no rows depend on `failedId` → returns `{ blocked: [] }`, emits a single `queue.propagate_blocked` event with empty array).
- `consecutive_failures` lives in CLI loop state (not persisted across engine invocations — a restart starts from 0). Resume of an in-flight cycle that exits terminal-failed counts toward the counter as if it had just failed.
- `engine.halted` event payload includes `{ failed_cycles: string[], reason: "max_consecutive_failures", threshold: number }` and is emitted before exit.
- Process exit code on halt: non-zero (preserve current `process.exit(halted ? 1 : 0)` semantics).
- Defaults loaded from `workflows.yml > engine.max_consecutive_failures`; the workflow loader already exposes the field (`workflow.ts:21`), no schema change required.

## Acceptance Criteria
- [ ] `propagateBlocked` moves direct dependents from `todo/` to `blocked/`, writes `blocked_by` frontmatter, removes their rows from `tbd.jsonl`, emits `issue.blocked` per moved file.
- [ ] Transitive dependents (A→B→C where C fails) end up in `blocked/` with `blocked_by` capturing the chain.
- [ ] Rows with empty `depends_on` or no overlap with `failedId` are untouched.
- [ ] An in-progress row whose `depends_on` includes `failedId` is also moved (RFC §7 walks "pending or in_progress").
- [ ] CLI loop survives one cycle failure and pops the next eligible row when `max_consecutive_failures >= 2` and a success follows.
- [ ] Two consecutive cycle terminal failures emit `engine.halted` with both failed cycle ids and exit non-zero.
- [ ] One failure → one success → one failure does NOT halt (counter resets).
- [ ] `--dry-run` skips `propagateBlocked` and the halt counter (no cycles execute).
- [ ] All existing tests still pass; new unit tests cover the propagate walk and the consecutive-failure counter transitions.
- [ ] `npm run typecheck` clean; coverage ≥ 95% line / ≥ 75% branch / ≥ 90% function with no per-file regression.

## Testing Strategy
- Node's native test runner (`node --test`), matching existing `tests/engine/*.test.ts` style. No new framework.
- New file `tests/engine/blocked.test.ts`:
  - direct dependent moved + row dropped + event emitted
  - transitive chain (A→B→C, C fails → A and B end in `blocked/`)
  - diamond (A and B both depend on X; X fails → both blocked, no double-move)
  - row with `depends_on: []` untouched
  - in_progress row honored
  - no-op when no rows match (empty `blocked` array, single event)
  - atomic rollback: simulate fs failure mid-walk → assert `tbd.jsonl` and folders remain consistent
- Extend `tests/cli.test.ts` (or add `tests/cli-halt.test.ts`):
  - one failure then one success → no halt, counter resets
  - two consecutive failures → `engine.halted` event with both ids, exit 1
  - failure → success → failure → success → no halt
  - resume detects a cycle past `max_cycle_attempts` (RFC §11 edge case) → terminal-fail path executes and counter increments
- Regression: confirm existing single-cycle pass + single-cycle fail tests still pass under the new counter semantics (a single fail with `max_consecutive_failures: 1` halts; with default 2 it does not).

## Documentation Updates
- **CLAUDE.md**: add a short paragraph under "Architecture quick reference" describing `propagateBlocked` (deterministic dependency walk, no LLM) and the consecutive-failures halt policy (counter resets on success). Update the bullet that currently describes `propagateBlocked` as a stub.
- **docs/RFC-001-issue-lifecycle.md**: no content change; mark §§7–8 as "Implemented in cycle 0017" via a short status note at the top of each section if the convention exists, else leave alone.
- **README.md**: no user-facing surface change in this cycle — skip unless a section already describes failure handling.

## Dependencies
- BB-3 (cycle 0014) already lands the per-row `attempt` counter, `cycle.end failed` row-drain, and the `todo/ → failed/` move on attempt-exhaustion. BB-6 only adds the *post-move* behavior (`propagateBlocked`) and the *cross-cycle* counter.
- BB-4 (cycle 0015) already lands `triage.ts` and the `blocked/` folder is already created by `init`. No new folders introduced.
- `src/engine/queue.ts` exposes the read/write primitives for `tbd.jsonl` rows used by the propagate walk.
- `src/engine/frontmatter.ts` exposes the read/write helpers used to stamp `blocked_by`.
- No external services, no new env vars.
