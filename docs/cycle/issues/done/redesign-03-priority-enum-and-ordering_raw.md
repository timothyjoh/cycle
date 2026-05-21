---
id: redesign-03-priority-enum-and-ordering
source: text
title: Introduce priority enum and engine-side deterministic queue ordering
added_at: "2026-05-21T02:42:44Z"
triage_attempts: 1
priority: high
---

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §5. Foundational for redesign-05 and redesign-07.

## Problem

Queue order is 100% the triage agent's call (`rewriteOrdering`, `src/engine/triage.ts:697` just honors the agent's `ordering` array). `QueueRow` has no priority field. Two unused numeric fields exist: RFC-001's integer `priority` (1–10, "not honored automatically"; `cycle drop` emits `3`) and reflection's `priority_hint`. Neither drives anything. Agent-decided ordering is non-deterministic — the same queue can order differently across runs.

## Approach

Replace both numeric fields with a single enum `priority: low | medium | high | critical | discuss`.

- Add `priority` to `QueueRow` and to triaged `todo/` frontmatter.
- Triage reads the raw's `priority`; if absent, **defaults to `medium`** and emits it per child.
- `materializeFreeformIssue` (`cycle drop`) default `3` → `medium`.
- Engine-side deterministic sort of pending rows: tier order `critical → high → medium → low`; **stable within a tier** (preserve insertion order); **never place a dependent before its `depends_on`** (topological clamp). The triage agent no longer decides global ordering.
- `discuss` is a routing flag (handled in redesign-05), not a tier — treat it as the lowest/parked for ordering purposes until that lands; this issue need only define the enum and the four ordering tiers.

Migration: existing on-disk issues with `priority_hint` or numeric `priority` — map at read time (e.g. ≥8 → critical, 5–7 → high, 3–4 → medium, 1–2 → low) or normalize during bootstrap. Pick one and document it.

## Acceptance Criteria

- [ ] `priority` enum defined and validated; default `medium` applied by triage when absent.
- [ ] `QueueRow` and `todo/` frontmatter carry `priority`.
- [ ] Engine sorts pending rows by tier, stable within tier, respecting `depends_on`; covered by tests including a dependent with higher priority than its dependency (dependency still runs first).
- [ ] `cycle drop` with no `--priority` produces `medium`.
- [ ] Numeric→enum migration path implemented and tested.
- [ ] CLAUDE.md / RFC-001 priority references updated to point at the enum.
- [ ] Recommended workflow: `feature`.
