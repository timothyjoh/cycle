# SPEC — Cycle 0189: Escalate Engine to Paused on Repeated Commit-Scope-Guard Failures

## Objective
Add a per-cycle-id counter for commit-scope-guard rejections so the engine detects deterministic retry loops and escalates to `engine.paused` instead of burning AI agent time on retries that will always reproduce the same violation.

## Source Issue
`refl-0187-engine-retries-cycle-on-deterministic-co` — "Escalate engine to paused on repeated commit-scope-guard failures for same cycle"

## Scope

### In Scope
- A `Map<cycleId, number>` counter scoped to the engine run (not persisted) tracking consecutive commit-scope-guard rejections per cycle
- Emit `engine.paused { reason: "commit-scope-guard-loop", cycle_id, violations }` on the 2nd consecutive `scope_violation` for the same `cycle_id`
- Reset the counter on successful commit for a given `cycle_id`
- Unit tests covering: two consecutive rejections → exactly one `engine.paused`; one rejection + success → no `engine.paused`

### Out of Scope
- Persisting the counter across engine restarts
- Root-cause fixes for why scope violations occur (see related issues)
- Changing the retry behavior for the first rejection (first still retries normally)
- Any UI or CLI changes

## Requirements
- Counter lives in `src/cli.ts` (the engine drain loop), keyed by `cycle_id`
- On `scope_violation` result from `commitCycle`: increment counter; if counter ≥ 2, emit `engine.paused` with `reason: "commit-scope-guard-loop"` and `violations: blockedFiles`, then halt (do not drain retry)
- On successful commit (`cr.status === "ok"`): delete or zero the counter entry for that `cycle_id`
- The `engine.paused` event shape must be consistent with existing usage in `src/engine/triage.ts`
- `npm test` passes; per-file coverage floors not broken

## Acceptance Criteria
- [ ] Engine tracks commit-scope-guard rejection count per `cycle_id`
- [ ] On 2nd consecutive rejection for same `cycle_id`, emit `engine.paused` with `reason: "commit-scope-guard-loop"` and `violations` payload; halt the drain loop
- [ ] First rejection still allows one retry (threshold is ≥ 2, not ≥ 1)
- [ ] Successful commit resets the per-cycle counter (delete map entry)
- [ ] Unit test: two consecutive scope-guard rejections on same `cycle_id` → `engine.paused` emitted exactly once (use `expectExactlyOne` from `tests/helpers.ts`)
- [ ] Unit test: one rejection followed by successful commit → no `engine.paused` emitted
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Framework: Node built-in test runner (existing pattern in `tests/`)
- Key scenarios:
  - Two consecutive `scope_violation` failures for same `cycle_id` triggers `engine.paused` exactly once with correct `reason` and `violations` fields
  - One `scope_violation` followed by successful commit: no `engine.paused`, counter cleared
  - `scope_violation` followed by non-scope failure: counter not confused
- Use `expectExactlyOne(events, "engine.paused")` for cardinality assertion

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No change — this is an engine-internal safety net with no new commands
- **docs/ENGINE.md**: Add a note under the halt policy section describing the `commit-scope-guard-loop` pause reason and the counter mechanism

## Dependencies
- `commitCycle` in `src/engine/commit-cycle.ts` already returns `{ status: "failed", reason: "scope_violation", blockedFiles }` — no changes needed there
- `engine.paused` event already emitted by `src/engine/triage.ts` — reuse same shape
- `expectExactlyOne` helper already exported from `tests/helpers.ts`
