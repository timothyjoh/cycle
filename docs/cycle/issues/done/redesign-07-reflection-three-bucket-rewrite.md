---
id: redesign-07-reflection-three-bucket-rewrite
title: Rewrite reflection to route sharp edges into fix-now / defer / discuss with a per-cycle cap
workflow: feature
depends_on: [redesign-03-priority-enum-and-ordering, redesign-04-footprint-json-and-scope-guard-demote, redesign-05-discuss-folder-lifecycle]
triaged_at: "2026-05-21T03:26:14.327Z"
source: triage
---
Capstone redesign of `src/engine/reflection.ts` — rewrite the reflection prompt and `ingestReflection` so each sharp edge is routed to one of three outputs: in-footprint mechanical fixes written to `FINAL_FIXES.md`, deferred work filed as `raw/` issues with a `priority` enum, and design forks parked as `priority: discuss` issues.

**Context:** RFC-003 §4. Prerequisites: redesign-03 (priority enum), redesign-04 (footprint + scope_warning), redesign-05 (discuss lane), redesign-06 (final_fix step — must be queued separately if not yet present in tbd.jsonl).

## Problem

Reflection currently emits every sharp edge as a `raw/` issue with a numeric `priority_hint`, with no volume bound and no in-cycle fix path. Result: exponential `todo/` growth, no in-cycle remediation, and no human gate for genuine design questions.

## Three-Bucket Routing

Each sharp edge is assigned to exactly one bucket:

| Bucket | Destination | Condition |
|---|---|---|
| **fix-now** | `FINAL_FIXES.md` | Confined to `touched.json` footprint AND mechanical (no design decision required) |
| **defer** | `raw/` issue + `priority` | Requires files outside the footprint, or large enough to warrant its own spec/review cycle; also covers `commit.scope_warning` escapes from redesign-04 |
| **discuss** | `raw/` issue + `priority: discuss` | Approach may be wrong or represents a genuine design fork |

## Volume Governance

- Emit at most 1-2 deferred raw issues per cycle, highest-value first.
- Dedup against `raw/`, `todo/`, `discuss/`, and recently-surfaced ids before writing.
- `FINAL_FIXES.md` is uncapped — bounded only by footprint + mechanical constraints.
- Replace all `priority_hint` numeric emission with the `priority` enum throughout.

## Implementation

### Reflection prompt (`src/engine/reflection.ts`)

Rewrite the prompt to elicit structured output with an explicit `bucket` field per sharp edge:

- `fix_now` — short mechanical fix description; must be confined to files in `touched.json`; no design decisions.
- `defer` — assign a priority from the enum introduced by redesign-03 (`critical | high | medium | low`).
- `discuss` — use `priority: discuss`; genuine design fork or "approach may be wrong" situation.

The prompt must make the routing criteria explicit so the LLM applies bright-line rules rather than guessing.

### `ingestReflection` changes

1. Accept `touchedJsonPath` as a new parameter; read the footprint set from `touched.json` (redesign-04).
2. Read `commit.scope_warning` list from the cycle artifact dir (redesign-04) — each warned file becomes a deferred cleanup issue.
3. Route each structured edge from the LLM response:
   - `fix_now` → append to `FINAL_FIXES.md` in the artifact dir (consumed by `final_fix` step from redesign-06).
   - `defer` → write to `docs/cycle/issues/raw/` with `priority` frontmatter; enforce 1-2 cap + dedup.
   - `discuss` → write to `docs/cycle/issues/raw/` with `priority: discuss`; counts toward the cap.
4. Write `REFLECTION.md` narrative including the routing decisions made this cycle.
5. Remove all `priority_hint` numeric emission; use `priority` enum throughout.

### Dedup logic

Before writing a new raw issue, check for a matching slug or id in:
- `docs/cycle/issues/raw/`
- `docs/cycle/issues/todo/`
- `docs/cycle/issues/discuss/`

Skip emission if any match found. Log a `reflection.dedup_skipped` event.

### Log events

- `reflection.fix_now_written` — emitted per fix-now item appended to `FINAL_FIXES.md`.
- `reflection.deferred_issue_written` — emitted per raw issue written.
- `reflection.dedup_skipped` — emitted when a candidate issue is dropped due to dedup.
- `reflection.cap_reached` — emitted when the 1-2 deferred cap is hit and remaining edges are dropped.

### Outputs per cycle run

- `REFLECTION.md` — always written; narrative + routing summary.
- `FINAL_FIXES.md` — written only when fix-now items exist; consumed by `final_fix` step (redesign-06).
- 0-2 new `raw/` issues — deferred or discuss items.

## Files to Change

- `src/engine/reflection.ts` — prompt rewrite + full `ingestReflection` routing logic.
- `src/engine/run-cycle.ts` — pass `touched.json` path to `ingestReflection`.
- `tests/reflection.test.ts` — update/add tests covering: three-bucket routing, cap enforcement, dedup against all three folders, scope_warning integration, priority_hint removal.

## Acceptance Criteria

- Reflection writes `REFLECTION.md`, `FINAL_FIXES.md` (when fix-now items exist), and ≤2 deferred raw issues carrying `priority`.
- In-footprint mechanical edges land in `FINAL_FIXES.md`, not as issues; `final_fix` step (redesign-06) consumes them.
- Out-of-footprint / large edges become deferred issues; design-fork edges become `priority: discuss` issues.
- `commit.scope_warning` files are read and turned into deferred cleanup issues.
- Deferred emission capped at 1-2/cycle; dedup against `raw/`, `todo/`, and `discuss/`.
- `priority_hint` fully replaced by `priority` enum; no numeric hints emitted anywhere in reflection output.
- Reflection prompt + `ingestReflection` tests updated; cap, routing, dedup, and scope_warning integration covered.
- Per-file coverage floor met: `src/engine/reflection.ts` ≥ 95%.
