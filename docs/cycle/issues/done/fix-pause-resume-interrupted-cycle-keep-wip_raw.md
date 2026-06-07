---
id: fix-pause-resume-interrupted-cycle-keep-wip
source: manual
title: "Pause (SIGTERM) must reap the run-one worker; restart must resume the interrupted cycle with WIP intact, not halt"
added_at: 2026-06-07T01:10:00Z
priority: high
---

## Problem

Interrupting a running engine mid-cycle (SIGTERM to the `cycle run` parent that holds `.cycle/engine.lock` — e.g. an operator/dashboard "pause") does not cleanly suspend the cycle. Two problems compound:

1. **The worker child is orphaned.** SIGTERM to the parent kills it but leaves its `cycle … run-one --cycle-id NNNN …` child **still running** and mutating the repo unsupervised. The lock file disappears (parent gone) while real cycle work continues. (Observed live, and reproduced while killing the fleet: parents died but `run-one` children — and their `claude` agent grandchildren — kept running and had to be tree-killed.)
2. **Restart halts instead of resuming.** Once the interrupted cycle's partial output is in the tree, the next `cycle run` treats it as a **terminal failure** and halts with `failed_cycle_dirty_worktree`, demanding `commit`/`stash`/`reset --hard` — instead of resuming that same cycle's remaining steps with its work-in-progress intact.

## Chosen behavior: suspend-and-resume, keep WIP

A signal-interrupted cycle is **resumable, not failed**. Its dirty worktree is *expected state*, not residue to clean. On restart the engine resumes that cycle from where it stopped (skip-completed steps), **keeping the partial work in the tree** — re-running the interrupted step on top of its own WIP. A genuine *step failure* (verify gate, non-zero agent exit) keeps today's halt-and-resolve guard; only the clean-interruption case changes.

> Note (accepted trade-off): re-running the interrupted step on top of partial changes means the step agent (e.g. `build`) restarts with its own half-applied edits already present. The resumed step's prompt should be aware WIP may exist so it reconciles rather than assumes a clean slate.

## Implementation pointers

**Worker reaping (signal handling).** The supervisor's SIGTERM/SIGINT handler emits `cycle.killed` (`src/cli.ts` ~line 210) and exits, but does not terminate the active `run-one` child — so it orphans. Fix: track the spawned `run-one` child PID and, on signal, forward SIGTERM→grace→SIGKILL to it (and let its own handler cascade to the `claude` agent), or spawn `run-one` in the engine's process group and signal the group. Mirror the existing SIGTERM→`WALKTHROUGH_KILL_GRACE_MS`→SIGKILL discipline (`exec-spawn.ts` / `walkthrough.ts`). No orphan may keep mutating the repo after the engine is signaled.

**Restart resume vs halt (the ordering bug).** On the resume-from-tail path, `src/cli.ts` (~678–683) arms `pendingResidueContext` from the log tail and calls `haltIfResidue()` **before** `runResumeOnce()`, so any dirty tree halts before the resume runs. Fix: distinguish *interrupted* from *failed* using the log tail — an in-flight cycle whose tail ends in `cycle.killed` (signal) rather than a step-failure terminal is **resumable**. For the interrupted case, **skip the `failed_cycle_dirty_worktree` halt** and go straight to `runResumeOnce`, which already resumes from `completedSteps` (`--skip-completed-on-retry`) — but **without** any teardown, leaving the WIP in place. For a genuine terminal failure, keep the existing residue guard unchanged. Consider writing an explicit "interrupted/suspended" marker on signal so the next run reads unambiguous intent rather than inferring from `cycle.killed`.

Relevant files: `src/cli.ts` (signal handler ~210; resume-from-tail block + `haltIfResidue` ~625/678–683; `runResumeOnce`), `src/engine/log-tail.ts` (`InFlightCycle` — surface interrupted-vs-failed), `src/engine/exec-spawn.ts` (worker spawn / process-group + signal forwarding).

## Acceptance criteria

- [ ] SIGTERM/SIGINT to a running engine terminates the active `run-one` worker (and its agent child) too — no orphan keeps running or mutating the repo after the signal. Bounded SIGTERM→grace→SIGKILL.
- [ ] A signal-interrupted cycle is recorded as interrupted/resumable (not a terminal failure); its WIP stays in the tree (never auto-discarded).
- [ ] A subsequent `cycle run` **resumes** that cycle from where it stopped (skip-completed), WIP intact — **no** `failed_cycle_dirty_worktree` halt for the clean-interruption case.
- [ ] A genuine step-failure cycle still halts/guards exactly as today (the residue guard and terminal-failure paths are unchanged for real failures).
- [ ] No silent data loss: the resume path never discards the operator's WIP.
- [ ] Tests: (a) signal interruption reaps the worker (no orphan); (b) interrupted cycle resumes with WIP, no halt; (c) real step-failure still halts; (d) resume re-runs the interrupted step on top of existing WIP.

## Relationship to sibling issues

- Distinct from `fix-engine-lock-not-held-concurrent-run` (already in inbox): that covers concurrent-`run` rejection / lock lifetime. This covers signal handling + interrupted-cycle resume. They jointly make "pause/resume" (e.g. maestro's dashboard control) behave correctly.
- Supersedes the earlier `fix-resume-teardown-before-residue-halt` draft (which proposed the opposite — teardown + clean-restart). Removed in favor of this suspend-and-resume design.
