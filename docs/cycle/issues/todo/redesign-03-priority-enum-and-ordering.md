---
id: redesign-03-priority-enum-and-ordering
title: Introduce priority enum and engine-side deterministic queue ordering
workflow: feature
depends_on: []
triaged_at: "2026-05-21T03:11:13.642Z"
source: triage
---
## Problem

Queue ordering is fully agent-driven: `rewriteOrdering` in `src/engine/triage.ts` honors whatever `ordering` array the triage agent emits. `QueueRow` has no priority field. Two unused numeric fields exist — RFC-001's integer `priority` (1–10, not honored automatically; `cycle drop` emits `3`) and reflection's `priority_hint` — but neither drives engine sort behavior. Ordering is non-deterministic across triage runs.

## Solution

Replace both numeric fields with a single priority enum and add engine-side deterministic sort.

### Enum Definition

```ts
type Priority = 'low' | 'medium' | 'high' | 'critical' | 'discuss';
```

`discuss` is a routing flag (redesign-05), not an ordering tier. For sort purposes treat it as parked below `low`.

### Changes Required

**1. Type layer** (`src/engine/queue.ts` or wherever `QueueRow` is defined):
- Export `Priority` type.
- Add `priority: Priority` to `QueueRow`.
- Add `priority` to `todo/` frontmatter schema.

**2. Triage integration** (`src/engine/triage.ts`):
- Read raw issue's `priority` field; if absent, default to `'medium'`.
- Emit `priority` per child in todo frontmatter.

**3. `cycle drop` / `materializeFreeformIssue`**:
- Default emit `priority: 'medium'` when no `--priority` flag is supplied.
- Strip old numeric default of `3`.

**4. Engine sort** (queue drain path, `src/engine/run-cycle.ts` or `src/engine/queue.ts`):
- After reading pending rows, sort deterministically: `critical → high → medium → low` (`discuss` parked last).
- Sort must be **stable within each tier** — preserve insertion order (triaged_at) for same-priority rows. Node 22 `Array.prototype.sort` is stable (V8 TimSort).
- **Topological clamp**: no dependent may precede its `depends_on` target regardless of priority tier.

**5. Numeric → enum migration** (applied at bootstrap read time, not a migration script):
- `priority >= 8` → `'critical'`
- `priority 5–7` → `'high'`
- `priority 3–4` → `'medium'`
- `priority 1–2` → `'low'`
- Missing or `priority_hint`-only → `'medium'`
- Strip `priority_hint` field after normalizing.

**6. Docs**:
- Update CLAUDE.md priority references to point at the enum.
- Update RFC-001 numeric priority description.
- Add sort-order note to `docs/ENGINE.md`.

### Acceptance Criteria

- [ ] `Priority` enum (`low | medium | high | critical | discuss`) exported and validated.
- [ ] `QueueRow` type carries `priority: Priority`.
- [ ] `todo/` frontmatter carries `priority`.
- [ ] Triage defaults absent `priority` to `'medium'`; emits per child.
- [ ] Engine sorts pending rows: `critical → high → medium → low`; stable within tier; `discuss` parked last.
- [ ] Topological clamp: dependent with higher priority still runs after its dependency — covered by a test with a high-priority child depending on a low-priority parent.
- [ ] `cycle drop` with no `--priority` flag produces `priority: 'medium'` in the emitted file.
- [ ] Numeric → enum migration tested: `8 → critical`, `6 → high`, `3 → medium`, `2 → low`, missing → `medium`.
- [ ] CLAUDE.md and RFC-001 priority references updated to enum.
- [ ] Coverage floor added for any new module in `scripts/coverage-gate.mjs` if coverage gating applies.
- [ ] Workflow: `feature`.

### Implementation Notes

- Find `QueueRow` canonical type location before modifying — check `src/engine/queue.ts` and `src/engine/triage.ts`.
- `rewriteOrdering` at `src/engine/triage.ts:697` still emits an `ordering` array; the engine-side sort runs on top of that during queue drain, overriding agent ordering.
- RFC-003 §5 is the authoritative spec for this work. This issue is foundational for redesign-05 (discuss folder lifecycle) and redesign-07 (reflection three-bucket rewrite).
