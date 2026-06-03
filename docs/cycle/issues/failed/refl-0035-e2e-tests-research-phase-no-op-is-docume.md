---
id: refl-0035-e2e-tests-research-phase-no-op-is-docume
title: Add a regression test for the e2e-tests research-phase no-op short-circuit
workflow: feature
depends_on: []
triaged_at: 2026-06-03T03:51:36.515Z
source: triage
priority: medium
failed_at: 2026-06-03T12:47:44.453Z
failed_step: build
failed_attempts: 3
last_cycle_id: "0041"
---
## Problem

CLAUDE.md and `docs/ENGINE.md` now assert that the research-phase no-op short-circuit fires for *any* workflow's `research` step (explicitly naming `e2e-tests`), matching the name-keyed `step.name === "research"` gate in `src/engine/run-cycle.ts` (no workflow check). But this cross-workflow behavior has **zero test backing**: the entire `tests/engine/noop-resolution.test.ts` suite drives only the `feature` workflow. REVIEW.md Finding 5 / the missing-tests note from cycle 0035 recorded this gap — the docs claim behavior no test exercises.

## Ask

Add a regression test (extend `tests/engine/noop-resolution.test.ts`) proving that an **`e2e-tests`** workflow `research` step which exits 0 and writes a valid `NOOP.md` short-circuits the cycle to `cycle.noop { detected_at_step: "research" }` followed by `cycle.end { status: "noop" }`, before `plan`/`build`/`review` run.

## Acceptance

- New test drives the `e2e-tests` workflow (not `feature`) so it genuinely exercises the cross-workflow, name-keyed `step.name === "research"` gate.
- Asserts `cycle.noop` fires exactly once with `detected_at_step: "research"` — cardinality-pin with `filter(...).length === 1` per the test-conventions rule, and assert the `cycle.end { status: "noop" }` ordering.
- Asserts the early short-circuit: `plan`/`build`/`review` steps do not run after the research no-op.
- Uses a valid marker (recognized `reason:` ∈ `already-satisfied | duplicate | not-actionable` + ≥1 `file.ext:line` evidence line) so it locks in the documented research-phase path (no empty-diff precondition).
- Coverage must not decrease; keep `src/engine/run-cycle.ts` at its existing floor.

## Why this matters

This pins the documented cross-workflow behavior so a future workflow-gating change can't silently re-introduce the doc-vs-code drift that was this cycle's only MUST-FIX.
