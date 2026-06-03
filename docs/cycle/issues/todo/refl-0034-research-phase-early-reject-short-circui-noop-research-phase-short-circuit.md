---
id: refl-0034-research-phase-early-reject-short-circui-noop-research-phase-short-circuit
title: Add a research-phase no-op short-circuit that resolves already-satisfied
  issues before spec/plan/build run
workflow: feature
depends_on: []
triaged_at: 2026-06-03T03:01:50.554Z
source: triage
priority: high
parent: refl-0034-research-phase-early-reject-short-circui
---
## Background

Cycle 0034 shipped the no-op / already-satisfied terminal resolution, but only the **build-phase fallback**: a `build`/`fix` step that exits 0 with an empty `src scripts tests` diff and a valid `NOOP.md` marker resolves the cycle to `cycle.noop` and drains the issue to `done/` without burning the failure budget (`src/engine/noop-marker.ts`, `run-cycle.ts`, `noopDrain` in `src/engine/issue-lifecycle.ts`).

The source issue `txt-20260601-220000-noop-already-satisfied-rejection-path` scoped **two** detection points. The second — a **research-phase early rejection**, explicitly marked the *primary* path — was deferred in BUILD.md to a "sibling cycle" that was never filed. When the source issue drained to `done/`, the primary half of its scope was silently lost. This issue files that missing half.

## Why this matters

The build-phase fallback only catches a moot issue *after* spec, research, plan, and build agents have already run — the agent budget is already spent by the time the empty diff is observed. The research step is where the engine first has enough context to recognize that an issue's work is already done, a duplicate, or not actionable. Rejecting there short-circuits the cycle **before** spec/plan/build/review agent budget is spent, which is the higher-value resolution path.

## Concrete user benefit

An already-satisfied issue is detected and drained to `done/` after only the research step, instead of after a full spec→build run. The user saves the agent cost of spec, plan, build, and review for issues that turn out to be moot — and gets the same clean `cycle.noop` terminal outcome (no failure-budget burn, no retry) one phase earlier.

## Scope (one vertical slice)

Reuse the existing no-op machinery — do **not** introduce a parallel marker schema or drain path.

1. **Marker emission.** Have the research step be able to emit a `NOOP.md` reject marker using the **same** schema the build phase already uses: a recognized `reason:` category (`already-satisfied | duplicate | not-actionable`) plus ≥1 `<path>.<ext>:<line>` evidence line. Update the research prompt so the agent writes `NOOP.md` when it concludes the issue is already satisfied / duplicate / not-actionable.
2. **Engine intercept.** Add an intercept after the research step in `run-cycle.ts` that reads `NOOP.md` via the existing `classifyNoopMarker` (fail-closed) and, on a **valid** marker, short-circuits to the existing `cycle.noop` terminal outcome — emit `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` (cardinality-pinned exactly-once) with `detected_at_step` set to the research step, then `cycle.end { status: "noop" }`, and return `{ status: "noop", reason, detectedAtStep }`. Route the resolution through the unchanged `noopDrain` / run-one exit code **3** path — issue moves to `done/`, `consecutive_failures` untouched, no retry, no `commitCycle`.
3. **Anti-slop guard.** Marker absent / malformed / unreadable / any internal error ⇒ research proceeds to the next step exactly as today (no behavior change). The short-circuit fires *only* on a valid marker.

## End state

A research step that writes a valid `NOOP.md` resolves the cycle to `noop` immediately — before spec/plan/build run — draining the issue to `done/` with `noop_at`/`noop_reason`/`noop_step`/`last_cycle_id` stamps and a `queue.drained { outcome: "noop" }` event, reusing `classifyNoopMarker` and `noopDrain`. The build-phase fallback from cycle 0034 remains as the late-detection path for issues that only become recognizable as moot once build runs.

## Tests

- Valid research-phase `NOOP.md` ⇒ `cycle.noop` emitted exactly once with `detected_at_step` = research step, `cycle.end { status: "noop" }`, issue drained to `done/`, no spec/plan/build steps run, `consecutive_failures` unchanged.
- Absent / malformed / unreadable marker ⇒ research proceeds normally, no `cycle.noop`.
- Cardinality-pin `cycle.noop` with `filter(...).length === 1`.

Update `docs/ENGINE.md` → *No-op / already-satisfied resolution* and CLAUDE.md to document the research-phase detection point alongside the build-phase fallback.
