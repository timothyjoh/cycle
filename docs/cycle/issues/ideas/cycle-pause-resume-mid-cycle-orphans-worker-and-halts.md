---
id: cycle-pause-resume-mid-cycle-orphans-worker-and-halts
title: "Pausing (SIGTERM) mid-cycle orphans the run-one worker and then halts on dirty residue instead of suspending and resuming the in-flight cycle"
---
## Summary

Interrupting a running engine mid-cycle (sending SIGTERM to the process holding
`.cycle/engine.lock`, e.g. a "pause" control) does **not** cleanly suspend the cycle.
Two problems compound:

1. **The worker child is orphaned.** SIGTERM to the parent `cycle run` orchestrator (the
   PID in `.cycle/engine.lock`) kills the parent but leaves its child
   `cycle … run-one --cycle-id NNNN …` worker **still running**. The lock disappears
   while real cycle work keeps mutating the repo unsupervised.
2. **Restart halts instead of resuming.** Once the (now-orphaned, then killed) cycle's
   partial output is in the tree, the next `cycle run` treats that cycle as a *terminal
   failure* and **halts** with `failed_cycle_dirty_worktree`, demanding the operator
   `commit` / `stash` / `discard` — rather than **resuming the in-flight cycle where it
   left off** with its work-in-progress intact.

The expectation (and the natural model for a "pause"): an interrupted cycle should be
**resumable** — stop cleanly, then on the next run continue that same cycle's remaining
steps (skip-completed) with its WIP in place — not require manual cleanup as if it had
failed.

## Observed (live, on a managed repo "blended", engine v0.2.0)

- A dashboard "pause" sent a graceful single-PID `SIGTERM` to the `.cycle/engine.lock`
  PID. Afterwards: **no `engine.lock`** (parent gone) but a
  `node .cycle/bin/cycle.js run-one --cycle-id 0003 --issue-id … --workflow feature`
  process was **still alive** (orphaned).
- After SIGTERM'ing that orphan and restarting `cycle run`:
  ```
  triage.start count:0 → triage.end
  engine.halted  reason:"failed_cycle_dirty_worktree"  failed_cycle_id:"0003"
  message: "Dirty worktree residue from failed cycle 0003 remains after terminal failure.
            Resolve it before the engine starts or resumes another cycle:
            commit it, or stash it (git stash), or discard it (git reset --hard)."
  engine.stop status:"halted" cycles_processed:0
  ```
  The ~18 cycle-0003 WIP files (e.g. `src/lib/perms.ts`, `instant.perms.ts`,
  `src/components/PermsProbe.tsx`, `e2e/permissions.spec.ts`, `package.json`) are real,
  wanted work — but the engine won't start until they're manually resolved, and there's
  no path to just *continue* cycle 0003.

## Desired behavior (refine at triage)

1. **Signal handling reaps the whole cycle.** A SIGTERM/SIGINT to the engine should
   terminate the active `run-one` worker too — run the worker in the engine's process
   group and forward the signal (or have the parent kill the child on its way down), so a
   pause/stop never orphans a worker that keeps mutating the repo. Mirror the
   SIGTERM→grace→SIGKILL discipline the engine already uses elsewhere.
2. **Distinguish "interrupted/paused" from "failed".** A cycle stopped by an external
   signal (not by a real step failure / verify gate) should be recorded as
   **interrupted/resumable**, not a terminal failure. Its dirty worktree is *expected
   state*, not residue to clean up.
3. **Resume the in-flight cycle on restart.** When the next `cycle run` finds an
   interrupted cycle, it should **resume** it — continue the remaining steps using the
   existing per-cycle artifacts (skip-completed) with the WIP left in the tree — instead
   of halting and demanding commit/stash/discard. A genuine *failed* cycle (step failure)
   should keep today's halt-and-resolve guard; only the clean-interruption case changes.
4. Possibly a first-class `cycle pause` / resume affordance (write an "interrupted"
   marker the next run reads), so external controllers (e.g. maestro's dashboard
   pause/start) get correct semantics for free.

## Why it matters

This is the behavior an operator/orchestrator expects from "pause then resume later":
keep the in-progress work and pick up where it left off. Today a pause effectively
**bricks the queue** (the engine won't run again until a human manually resolves the
dirty tree) and, worse, **orphans a worker** that runs on after the "pause." Surfaced via
maestro's per-row start/pause control, but the root cause and fix are in the cycle engine.

## Acceptance (sketch — refine at triage)

- SIGTERM/SIGINT to a running engine terminates the active `run-one` worker too (no
  orphan keeps running / mutating the repo after the engine is signaled).
- A signal-interrupted cycle is recorded as interrupted/resumable (not a terminal
  failure); its WIP stays in the tree.
- A subsequent `cycle run` **resumes** that cycle from where it stopped (skip-completed),
  with the WIP intact — no `failed_cycle_dirty_worktree` halt for the clean-interruption
  case. A real step-failure still halts-and-resolves as today.
- No silent data loss: the operator's WIP is never discarded by the resume path.
