# SPEC — Cycle 0226: Introduce Priority Enum and Engine-Side Deterministic Queue Ordering

## Objective

This cycle replaces the two-field numeric priority system (`priority: 1–10` and `priority_hint`) with a single `Priority` enum (`low | medium | high | critical | discuss`) and adds deterministic engine-side sort to the queue drain path. Today, queue ordering is fully agent-driven and non-deterministic across triage runs. After this cycle, the engine owns sort order — critical issues always drain before high, high before medium, and so on — while preserving insertion order within each tier and respecting `depends_on` topology.

## Source Issue

`redesign-03-priority-enum-and-ordering` — "Introduce priority enum and engine-side deterministic queue ordering"

## Scope

### In Scope

- Export `Priority` type and add `priority: Priority` to `QueueRow` in `src/engine/queue.ts`
- Triage integration: read raw issue `priority`, default absent to `'medium'`, emit per child in todo frontmatter
- Engine-side sort in queue drain: `critical → high → medium → low`, `discuss` parked last, stable within tier, topological clamp
- Numeric → enum migration at bootstrap read time (no migration script)
- `cycle drop` / `materializeFreeformIssue`: emit `priority: 'medium'` by default, strip old numeric `3`
- Documentation updates: CLAUDE.md priority references, RFC-001 numeric priority description, `docs/ENGINE.md` sort-order note

### Out of Scope

- `discuss` folder lifecycle (redesign-05)
- Reflection three-bucket rewrite (redesign-07)
- A `--priority` flag for `cycle drop` (flag parsing is a separate cycle if desired)
- Persistent queue migration script (runtime normalization at read is sufficient)

## Requirements

- `Priority` type exported from `src/engine/queue.ts` as a string union: `'low' | 'medium' | 'high' | 'critical' | 'discuss'`
- `QueueRow` carries `priority: Priority`; `isQueueRow` guard validates it against the known string values
- `readQueue` normalizes legacy numeric `priority` and `priority_hint` fields at read time before returning rows
- Queue drain sorts pending rows deterministically: `critical` first, then `high`, `medium`, `low`, `discuss` last; stable (preserves `triaged_at` insertion order within a tier)
- Topological clamp: a dependent row with higher priority must not precede its `depends_on` target regardless of priority tier
- Triage emits `priority` in each child's todo frontmatter; absent field in raw issue defaults to `'medium'`
- `materializeFreeformIssue` emits `priority: 'medium'`; numeric `3` default removed
- Coverage floor added for any new source module; no existing floor may decrease

## Acceptance Criteria

- [ ] `Priority` type (`'low' | 'medium' | 'high' | 'critical' | 'discuss'`) is exported from `src/engine/queue.ts`
- [ ] `QueueRow` type carries `priority: Priority`; `isQueueRow` guard rejects rows with invalid or missing `priority`
- [ ] `todo/` frontmatter produced by triage carries a `priority` field
- [ ] Triage defaults an absent `priority` in the raw issue to `'medium'` and emits it per child
- [ ] Engine sorts pending rows `critical → high → medium → low`, `discuss` last; sort is stable within each tier
- [ ] A test covers the topological clamp: a `high`-priority child depending on a `low`-priority parent runs after the parent
- [ ] `cycle drop` with no `--priority` flag produces `priority: 'medium'` in the emitted file (numeric `3` default absent)
- [ ] Numeric → enum migration tests pass: `8 → 'critical'`, `6 → 'high'`, `3 → 'medium'`, `2 → 'low'`, missing → `'medium'`
- [ ] `priority_hint` field stripped from rows after normalization
- [ ] CLAUDE.md and RFC-001 priority references updated to enum; `docs/ENGINE.md` has sort-order note
- [ ] `scripts/coverage-gate.mjs` `FLOORS` table updated for any new module
- [ ] All existing tests still pass; coverage does not decrease vs. master baseline

## Testing Strategy

- Test framework: Node built-in test runner (`node:test`) with `--experimental-strip-types`, matching existing suite conventions
- Unit tests for `normalizePriority(raw)` covering all numeric bucket mappings and missing-field case
- Unit tests for queue sort: verify `critical` rows precede `high`, `high` precede `medium`, `medium` precede `low`, `discuss` last; verify stability (two `medium` rows preserve insertion order)
- Integration test for topological clamp: queue with `high`-priority child depending on `low`-priority parent; assert parent drains first
- Triage integration tests: raw issue with explicit `priority: 'critical'` emits `critical` in todo; raw issue with no `priority` field emits `medium`
- `cycle drop` test: confirm emitted frontmatter contains `priority: 'medium'` and no numeric priority field

## Documentation Updates

- **CLAUDE.md**: Update priority references in workflow defaults section to name the enum values rather than 1–10 scale
- **RFC-001** (`docs/RFC-001-issue-lifecycle.md`): Replace numeric priority description (1–10, `cycle drop` emits `3`) with enum description
- **docs/ENGINE.md**: Add sort-order note to queue drain section documenting `critical → high → medium → low → discuss` with topological clamp

## Dependencies

- `src/engine/queue.ts` — `QueueRow` and `readQueue` already exist; extend in place
- `src/engine/triage.ts` — `rewriteOrdering` and triage emit path already exist; extend in place
- `src/engine/run-cycle.ts` — queue drain path must apply sort after `readQueue`; locate exact call site before modifying
- Node 22 `Array.prototype.sort` stable guarantee (V8 TimSort) — already available in runtime floor
