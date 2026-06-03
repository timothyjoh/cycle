---
id: refl-0039-within-budget-drainretry-arm-leaves-no-p
title: Persist residue context at the within-budget drainRetry arm for
  crash-safe re-check
workflow: feature
depends_on: []
triaged_at: 2026-06-03T09:08:21.344Z
source: triage
priority: low
---
Cycle 0039 persists `pendingResidueContext` to `.cycle/failed-residue-context.json` at the four terminal-failure branches (resume-terminal, commit-failed, fast-bail, attempts-exhausted), but the within-budget `drainRetry` arm (cycle 0038, around `src/cli.ts:871`) still arms the context **in memory only**. A process that crashes after a within-budget retry is queued but before it re-runs leaves uncommitted residue with no persisted context, so a fresh engine start does not re-check it — the exact silent-stack-on-residue failure the guard exists to prevent. This is the one remaining durability hole that keeps the guard from being fully crash-safe; BUILD.md and the engine docs already flag it as the remaining limitation, but it was not yet a tracked issue.

## Fix

Mechanically symmetric to what cycle 0039 already did at the four terminal-failure branches:

- Call `persistResidue(pendingResidueContext)` adjacent to the existing in-memory set at the `drainRetry` arm in `src/cli.ts`, so the within-budget retry path mirrors the persisted four branches.
- Confirm the existing clear sites (success / noop / clean-tree transitions) already cover the on-disk delete for that path — they should, since the clear is keyed off the same `pendingResidueContext` lifecycle; verify and add a delete call only if a path is uncovered.

## Scope / acceptance

- Narrow, surgical change in `src/cli.ts`; no new state file, no new event, no schema change — reuses `src/engine/residue-context-store.ts`.
- Add a regression test asserting the within-budget retry arm persists `.cycle/failed-residue-context.json` and that a simulated fresh engine start re-checks and halts on the residue (mirror the existing four-branch persistence tests).
- Update the doc note that currently calls this out as the remaining limitation once closed.

Low priority: within-budget retries are uncommon and the crash must land in the narrow window between queue-and-rerun. But closing it makes the residue guard fully crash-safe across every loop-back path.
