---
id: refl-0036-residue-guard-has-no-cross-process-re-ch
title: Persist failed-cycle residue context so the guard re-checks the worktree
  across engine restarts
workflow: feature
depends_on: []
triaged_at: 2026-06-03T04:52:55.667Z
source: triage
priority: medium
---
## Problem

The failed-cycle dirty-worktree residue guard (`src/engine/failed-residue-guard.ts` + `src/cli.ts`) is **in-process only**. Its `pendingResidueContext` lives in memory and is set at terminal-failure branches within a single supervisor run. The resume path arms from the log tail, but `readLogTail` only returns a tail for an *in-flight* cycle (a `cycle.start` with no matching `cycle.end`).

After a cycle that ended in **terminal failure** (`cycle.end {status: "failed"}` is present in the log), a full engine restart finds no in-flight tail, never arms `pendingResidueContext`, and the `while (!halted)` loop pops the next pending issue on top of any residue with **no check**. For an AFK operator this is the realistic recovery path — the engine dies and is relaunched — so the protection silently does not apply across restarts.

## Why this matters

This is precisely the resilient/durable-by-default behavior the guard exists to provide. The cross-process gap means a failed cycle's uncommitted residue can have a fresh cycle stacked on top of it after any restart, which in trunk mode (`CYCLE_TRUNK_BASED=1`) sits directly on the base branch. Closing it is what makes the guard trustworthy for unattended operation.

## Direction

Recon's lineage solves this with a `.cycle/failed-residue-context.json` startup re-check; mainline explicitly **deferred** this to a sibling cycle (documented in `docs/ENGINE.md` and `CLAUDE.md`'s *Failed-cycle dirty-worktree residue guard* note: "Cross-process persistence of the residue context across full engine restarts (recon's `.cycle/failed-residue-context.json` startup re-check) is **not** implemented this cycle (in-process only)") but it is not yet filed. This issue files it.

A startup-time worktree check is the natural follow-up:

- At every terminal-failure branch that sets the in-memory `pendingResidueContext`, also **persist** the residue context to `.cycle/failed-residue-context.json` (failed cycle id, issue id). Treat `.cycle/**` as engine-owned state (already excluded by `isEngineOwned`).
- At engine start (after lock/config load), if the persisted context file is present, **re-run the residue check** before triage / before popping the next pending issue, reusing the existing `readFailedCycleResidue` / `formatFailedCycleResidueDiagnostic` path. Residue present ⇒ the same `engine.halted { reason: "failed_cycle_dirty_worktree", ... }` + terminal `engine.stop` + diagnostic on stderr + non-zero exit as the in-process gate.
- **Clear** the persisted context on the same success/noop/clean-tree transitions that clear the in-memory copy, so a clean restart does not falsely halt.
- A malformed/unreadable context file must not crash startup — degrade safely (treat as no pending context, optionally a warning), never coerce a failed read into a silent proceed (mirror the existing `git status` non-zero ⇒ halt discipline).

## Acceptance

- After a terminal-failure cycle leaves residue, killing and relaunching the engine halts at startup with `failed_cycle_dirty_worktree` instead of stacking a new cycle on the dirty tree.
- A clean tree (or successfully remediated residue) on restart proceeds normally with no spurious halt and clears the persisted context.
- Update `docs/ENGINE.md` and the `CLAUDE.md` *Failed-cycle dirty-worktree residue guard* note to reflect that cross-process persistence is now implemented (remove the "not implemented this cycle / in-process only" caveat).
- Coverage held per policy; cardinality-pin the startup `engine.halted` emit with `filter(...).length === 1`.

Note: the **within-budget `drainRetry` residue gate** is a *separate* recon-parity gap tracked by `refl-0036-drainretry-within-budget-retry-path-is-n-residue-gate-within-budget-retry`; keep this issue scoped to cross-process persistence/startup re-check only.
