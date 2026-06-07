---
id: refl-0272-verify-gate-step-names-are-unguarded-aga
title: Pin terminal verify step names with a structural invariant so the
  degenerate-verification gate can't silently go inert
workflow: feature
depends_on: []
triaged_at: 2026-06-07T15:12:14.721Z
source: triage
priority: medium
---
## Problem

The degenerate-verification gate (cycle 0272) fires only when `step.name === "verify" || step.name === "final_verify"` — hardcoded literals at `src/engine/run-cycle.ts:905`. Nothing ties those literals to the actual step names in `src/defaults/workflows.yml`. If a future refactor renames the terminal bash verify step (e.g. to `verify_app`) or collapses `final_verify`, the no-false-greens gate goes **silently inert with zero signal** — itself a false-green vector, the exact failure class this gate exists to prevent.

## Deliverable

Add a build-time structural invariant (preferred — mirrors how the walkthrough phases are kept honest) — or a test if an invariant cannot cleanly express it — pinning that every default workflow's terminal bash verify step is named `verify` or `final_verify`. Express it against the existing `INVARIANTS` table in `scripts/structural-invariants.mjs` (the single source of truth per CLAUDE.md), so a rename that would orphan the gate fails the build loud instead of disabling verification.

## Acceptance criteria

- A structural invariant (registered in `scripts/structural-invariants.mjs`, enforced via `npm run check:invariants`) asserts that each default workflow in `src/defaults/workflows.yml` whose terminal/verification bash step exists names it `verify` or `final_verify` — i.e. the names the gate keys on (`run-cycle.ts:905`) stay in lockstep with the configured workflow step names.
- Renaming the terminal verify step in `workflows.yml` to anything outside the gate's recognized set fails the invariant with a clear, actionable message naming the workflow and the offending step name.
- The invariant uses the existing relational/predicate entry mechanism (`{ file, validate, reason }`) and follows the import-safe / containment conventions already established in that script (a thrown predicate is contained as a FAIL, never a silent pass).
- Keep the gate's recognized-name set and the invariant in one shared place (or otherwise prevent the two from drifting), so the guard guards its own wiring rather than introducing a second hand-maintained mirror.
- Coverage and invariant gates stay green; add/extend tests under `tests/scripts/structural-invariants.test.ts` to drive the new entry's pass and fail branches in-process.
- Document the new invariant in the structural-invariants section of `CLAUDE.md` (one line, consistent with the existing entries).
