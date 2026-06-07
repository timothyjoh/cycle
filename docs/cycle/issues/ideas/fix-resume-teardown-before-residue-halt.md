---
id: fix-resume-teardown-before-residue-halt
source: manual
title: "Resume path must teardown a killed/crashed cycle's residue before the dirty-worktree halt"
added_at: 2026-06-07T00:30:00Z
priority: high
---

## Problem

A `cycle.killed` (intentional pause) or mid-cycle crash bricks the engine on restart. The startup-resume path in `src/cli.ts` reads the in-flight log tail, arms the residue guard from it, and calls `haltIfResidue()` **before** `runResumeOnce()` — so any dirty tree (the interrupted step's legitimate in-progress output) trips `engine.halted { reason: "failed_cycle_dirty_worktree" }` instead of self-healing.

Observed in a consumer repo (v0.2.0): cycle 0003 completed spec/research/plan, then `step.start build` → user paused → `cycle.killed 0003`. On restart: `engine.start → preflight.ok → triage → engine.halted{failed_cycle_dirty_worktree}` (repeatably). The build step's partial code was indistinguishable from "failed-cycle residue," so the engine halted on every restart.

## The contradiction (this is a bug, not intended behavior)

CLAUDE.md / `docs/ENGINE.md` already claim the resume path self-heals:

> "The same teardown runs on the resume path (`runResumeOnce`), so a mid-cycle crash + restart self-heals instead of residue-halting. The dirty-worktree residue guard is therefore now a **fallback**."

The code does **not** do this. The ordering (current `src/cli.ts`, resume block ~lines 672–685):

```js
const tail = await readLogTail(cwd);
if (tail) {
  pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };
  if (await haltIfResidue()) { /* HALT — fires on ANY dirty tree, wins the race */ }
  else { await runResumeOnce(...) /* teardown self-heal lives here, never reached */ }
}
```

`haltIfResidue()` (~line 625) short-circuits before `runResumeOnce` ever runs, so the documented teardown self-heal is dead code on this path.

## Scope

On the **startup / resume-from-tail** path only: when there is an in-flight tail, run `runFailedCycleTeardown` (from `src/engine/failed-cycle-teardown.ts`) on the killed cycle **first**, then resume at the interrupted step on the now-clean tree. Reduce `haltIfResidue` on this path to its documented **fallback** role — it fires only if teardown *fails* to produce a clean tree.

Do **not** change the genuine terminal-failure residue behavior (the loop-top and post-terminal `pendingResidueContext` gates that protect against stacking a new cycle on a failed cycle's residue) — only the startup/resume-from-tail arm changes from halt-first to teardown-first.

## Acceptance criteria

- [ ] On restart with an in-flight log tail (killed/crashed cycle) and a dirty tree of **non-engine** residue, the engine tears down the residue and emits `engine.resume` + resumes the interrupted step — **not** `engine.halted{failed_cycle_dirty_worktree}`.
- [ ] Teardown reuses `isEngineOwned`, so `.cycle/**`, `docs/cycle/**`, the queue, the log, and the in-flight cycle's completed-step artifacts (`SPEC/RESEARCH/PLAN.md`) are never reverted/removed.
- [ ] If teardown **fails** to clean the tree, the existing `failed_cycle_dirty_worktree` halt still fires (fail-loud fallback preserved, byte-for-byte payload).
- [ ] Clean-tree resume path is unchanged (no teardown side effects when there's nothing to clean).
- [ ] The terminal-failure residue gates (startup persisted-file re-check, before-`runResumeOnce` for a true terminal failure, loop-top) keep their current behavior — this change is confined to the in-flight-tail resume arm.
- [ ] Tests: (a) killed mid-cycle + dirty non-engine residue → resume self-heals; (b) teardown-failure → still halts; (c) clean tree → resume unchanged; (d) engine-owned paths never torn down.
- [ ] Reconcile the docs: CLAUDE.md and `docs/ENGINE.md` already describe self-heal — make the code match the claim (and note the teardown-before-halt ordering explicitly).

## Out of scope

- Consumer-repo hygiene (e.g. gitignoring build-output dirs like `.vercel/` so they don't count as residue) — that's a per-repo fix, not the engine.
- Preserving the interrupted step's partial work across the restart — the clean-restart/rerun-the-step philosophy is intentional; this issue only removes the halt, it does not try to salvage half-done output.

Relevant files: `src/cli.ts` (resume-from-tail block + `haltIfResidue`), `src/engine/failed-cycle-teardown.ts` (`runFailedCycleTeardown`), `src/engine/failed-residue-guard.ts`.
