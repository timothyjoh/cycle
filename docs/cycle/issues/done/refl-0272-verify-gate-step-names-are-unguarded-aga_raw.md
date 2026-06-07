---
id: refl-0272-verify-gate-step-names-are-unguarded-aga
source: reflection
title: verify-gate step names are unguarded against workflow renames
added_at: 2026-06-07T15:08:41.354Z
triage_attempts: 1
priority: medium
origin_cycle_id: "0272"
---

The degenerate-verification gate fires only when `step.name === "verify" || step.name === "final_verify"` (hardcoded literals at `src/engine/run-cycle.ts:905`). Nothing ties those literals to the actual step names in `src/defaults/workflows.yml`. If a future refactor renames the terminal bash verify step (e.g. to `verify_app` or collapses `final_verify`), the no-false-greens gate goes silently inert with zero signal — itself a false-green vector, the exact failure class this gate exists to prevent.

Add a structural invariant (or a test) pinning that every default workflow's terminal bash verify step is named `verify`/`final_verify`, mirroring how the walkthrough phases are kept honest. This is mechanical to express against the existing `INVARIANTS` table and closes a silent-disablement window on the gate's own wiring.
