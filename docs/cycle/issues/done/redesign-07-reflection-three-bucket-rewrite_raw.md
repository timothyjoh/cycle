---
id: redesign-07-reflection-three-bucket-rewrite
source: text
title: Rewrite reflection to route sharp edges into fix-now / defer / discuss with a per-cycle cap
added_at: "2026-05-21T02:42:44Z"
triage_attempts: 0
priority: high
---

See [RFC-003](../../../RFC-003-in-cycle-remediation-and-priority-routing.md) §4. **Capstone — prerequisites: redesign-03 (priority enum), redesign-04 (footprint + scope_warning), redesign-05 (discuss lane), redesign-06 (final_fix step).**

## Problem

Reflection currently surfaces every sharp edge as a `raw/` issue with a numeric `priority_hint`, with no in-cycle fix path and no volume bound — driving exponential `todo/` growth. We want trivial in-scope edges fixed this cycle, deferred work prioritized and capped, and design questions parked for humans.

## Approach

Rewrite the reflection prompt and `ingestReflection` (`src/engine/reflection.ts`) so reflection produces three outputs and routes each sharp edge by the §4 rule:

- **`REFLECTION.md`** — narrative including the routing decisions made this cycle.
- **`FINAL_FIXES.md`** — mechanical, in-footprint fix list consumed by `final_fix`.
- **`raw/` issues** — deferred work, each with a `priority` enum (incl. `discuss`).

Routing rule (bright lines):
- **fix-now → FINAL_FIXES.md**: confined to the cycle footprint (`touched.json`) AND mechanical (no design decision).
- **defer → raw/ issue + priority**: requires files outside the footprint, or large enough for its own spec/review. **Includes the `commit.scope_warning` escapes** from redesign-04 — reflection reads that list and files cleanup issues for files this cycle shouldn't have touched.
- **discuss → raw/ issue + priority: discuss**: approach may be wrong / genuine design fork.

Volume governance:
- Emit **at most the top 1–2 deferred issues per cycle**, highest-value first.
- Dedup against `raw/`, `todo/`, `discuss/`, and recently-surfaced ids.
- `FINAL_FIXES.md` is uncapped (bounded by footprint + mechanical).
- Replace `priority_hint` emission with the `priority` enum throughout.

## Acceptance Criteria

- [ ] Reflection writes REFLECTION.md, FINAL_FIXES.md (when fix-now items exist), and ≤2 deferred raw issues carrying `priority`.
- [ ] In-footprint mechanical edges land in FINAL_FIXES.md, not as issues; `final_fix` consumes them.
- [ ] Out-of-footprint / large edges become deferred issues; design-fork edges become `priority: discuss` issues.
- [ ] `commit.scope_warning` files are read and turned into cleanup issues.
- [ ] Deferred emission is capped at 1–2/cycle and dedups against existing queues.
- [ ] `priority_hint` fully replaced by `priority`; reflection no longer emits the numeric hint.
- [ ] Reflection prompt + ingestReflection tests updated; cap, routing, and dedup covered.
- [ ] Recommended workflow: `feature`.
