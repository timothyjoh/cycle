---
id: refl-0036-drainretry-within-budget-retry-path-is-n-residue-gate-within-budget-retry
title: Residue-gate the within-budget drainRetry path so retries never run on a
  dirty tree
workflow: feature
depends_on: []
triaged_at: 2026-06-03T04:52:22.157Z
source: triage
priority: high
parent: refl-0036-drainretry-within-budget-retry-path-is-n
---
## Problem

The failed-cycle dirty-worktree residue guard (cycle 0036, `src/engine/failed-residue-guard.ts` + `src/cli.ts`) arms `pendingResidueContext` only at the **terminal** failure branches. It does **not** arm it on the within-budget retry path — the `else if (row.attempt + 1 < maxAttempts) { await drainRetry(...) }` arm in `src/cli.ts` (around `src/cli.ts:787`).

Consequence: a `build`/`spec`/`review` step that fails mid-write, leaves uncommitted residue, and still has retry budget remaining will re-run on the next loop iteration with `pendingResidueContext` unset. The loop-top `haltIfResidue()` is therefore a no-op for that iteration, and the retry executes **on top of the dirty tree** — the exact failure mode the guard was built to prevent.

This is the same incident SPEC for cycle 0036 cited as its motivation (cycles 0027/0028: the engine "thrashed across retries ... on the polluted tree"), yet the retry path is precisely the one the guard does not cover. It is currently documented in `docs/ENGINE.md` as the recon-parity `drainRetry` gap but was never filed as an issue.

## Scope

Close the within-budget retry gap so a retry, like resume and next-issue, is residue-gated:

- Arm `pendingResidueContext` (or run the residue check) before `drainRetry` executes on the within-budget retry arm, so the loop-top `haltIfResidue()` (or an equivalent pre-`drainRetry` check) sees the residue from the just-failed attempt.
- Preserve the existing engine-owned exclusion semantics (`isEngineOwned` — `.cycle/**`, `docs/cycle/**`, denied paths never trip it) so legitimate engine state and issue-lifecycle moves don't false-positive a retry.
- On residue present, emit the same single `engine.halted { reason: "failed_cycle_dirty_worktree", ... }` + terminal `engine.stop` + diagnostic + non-zero exit as the existing two gated sites — do not introduce a new halt reason.
- Keep `git status` non-zero halting (a failed check is never coerced to "clean").

## Verification

- A test simulating a within-budget retry where the failed attempt left uncommitted `src/**` residue must halt with `failed_cycle_dirty_worktree` **before** `drainRetry` re-runs the cycle on the dirty tree — cardinality-pin the `engine.halted` emission with `filter(...).length === 1`.
- A clean-tree within-budget retry proceeds byte-for-byte unchanged (no new event).
- Update the `docs/ENGINE.md` *Failed-cycle dirty-worktree residue guard* note: the `drainRetry` recon-parity gap is now closed (or narrow the remaining gap to cross-process restart only).
