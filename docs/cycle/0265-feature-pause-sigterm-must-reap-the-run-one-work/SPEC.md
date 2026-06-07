# SPEC — Cycle 0265: Suspend-and-resume on signal — reap the worker, resume the interrupted cycle with WIP intact

## WHY
Interrupting a running engine mid-cycle (SIGTERM to the `cycle run` parent that holds `.cycle/engine.lock` — an operator/dashboard "pause") does not cleanly suspend the cycle. Two failures compound:

1. **The worker child is orphaned.** SIGTERM to the supervisor kills the parent but leaves its `cycle … run-one --cycle-id NNNN …` child — and that child's `claude` agent grandchild — still running and mutating the repo unsupervised. The lock file vanishes (parent gone) while real cycle work continues. Observed live while killing a fleet: parents died, `run-one` children kept running and had to be tree-killed.
2. **Restart halts instead of resuming.** The interrupted cycle's partial output is in the tree, so the next `cycle run` arms `pendingResidueContext` from the log tail and `haltIfResidue()` fires **before** `runResumeOnce()` — the dirty tree is treated as a terminal `failed_cycle_dirty_worktree` residue and the engine demands `commit`/`stash`/`reset --hard` instead of resuming the cycle's remaining steps with its work-in-progress intact.

Together these make "pause" unsafe: it leaks a mutating orphan and then refuses to un-pause.

## CONCRETE USER BENEFIT
An operator can pause a running engine with a single SIGTERM and later resume it: after the signal, **no `run-one` worker (or its agent child) is left running or mutating the repo**, and the next `cycle run` **continues the interrupted cycle from where it stopped with the partial work still in the tree** — no manual `git reset --hard`, no lost WIP, no halt. This is the foundation of maestro's dashboard pause/resume control.

## USABLE END-STATE
- Sending SIGTERM/SIGINT to a `cycle run` supervisor terminates the active `run-one` worker and its agent descendant within a bounded grace window — `ps` shows no orphaned `run-one`/`claude` process afterward.
- The interrupted cycle is recorded as **interrupted/resumable**, not as a terminal failure; its dirty worktree is preserved untouched.
- Re-running `cycle run` resumes that same cycle (skip-completed steps), keeping the WIP, and re-runs the interrupted step on top of its own partial changes — without emitting `failed_cycle_dirty_worktree`.
- A genuine step failure (verify gate / non-zero agent exit) still halts and guards exactly as today.

## Objective
Make a signal interruption a clean **suspend** rather than a leak-and-halt. On signal, the supervisor reaps the spawned `run-one` worker (bounded SIGTERM→grace→SIGKILL, letting the worker's own handler cascade to its agent child) and records an unambiguous "interrupted" marker. On the next start, the resume-from-tail path distinguishes an interrupted cycle from a terminally-failed one: for the interruption it **skips the residue halt** and routes straight to `runResumeOnce` with no teardown, leaving the WIP in place; for a real failure it keeps today's residue guard byte-for-byte.

## Source Issue
`fix-pause-resume-interrupted-cycle-keep-wip` — "Pause (SIGTERM) must reap the run-one worker; restart must resume the interrupted cycle with WIP intact, not halt"

## Scope

### In Scope
- **Worker reaping on signal.** Track the spawned `run-one` child (PID/handle from `spawnRunOne`) and, in the supervisor's `SIGTERM`/`SIGINT` handler (`src/cli.ts` ~234), forward `SIGTERM`→grace→`SIGKILL` to it before the parent exits, mirroring the existing `WALKTHROUGH_KILL_GRACE_MS` discipline. The worker's own signal handler cascades to its `claude` agent grandchild. No orphan keeps mutating the repo after the signal.
- **Interrupted marker + log-tail surfacing.** On signal, write an explicit interrupted/suspended marker (extending the existing `cycle.killed` append) so the next run reads unambiguous intent. Surface interrupted-vs-failed on `InFlightCycle` (`src/engine/log-tail.ts`): a tail ending in the signal/`cycle.killed` terminal is `interrupted`; a step-failure terminal is not.
- **Resume-path branch.** In the resume-from-tail block (`src/cli.ts` ~698–752), when the tail is `interrupted`, **bypass `haltIfResidue()`** and call `runResumeOnce` with **no teardown** (WIP preserved); for a non-interrupted in-flight tail, keep the current residue-gated path unchanged.

### Out of Scope
- Concurrent-`run` rejection / lock-lifetime changes — owned by sibling `fix-engine-lock-not-held-concurrent-run` (already landed in cycle 0264).
- Process-group spawning of the worker as an alternative to PID tracking — only adopt it if PID-forwarding cannot reliably reach the agent grandchild; otherwise defer.
- Changing the resumed step's prompt to reconcile pre-existing WIP. The engine-side resume is in scope; richer "WIP may exist" prompt wording is a follow-up.
- Any change to the genuine-failure residue guard, teardown, or `max_consecutive_failures` accounting.

## Requirements
- The `SIGTERM`/`SIGINT` handler must terminate the active `run-one` worker with a **bounded** SIGTERM→grace→SIGKILL sequence before the supervisor exits; the grace window reuses the existing kill-grace constant convention.
- Reaping must be synchronous-enough to complete inside the signal handler path (the handler already calls `process.exit`); the worker must not survive the parent.
- A signal-interrupted cycle is recorded as `interrupted`/resumable and its WIP is **never** auto-discarded (no teardown, no revert, no doc-wipe on this path).
- `runResumeOnce` resumes the interrupted cycle via the existing skip-completed mechanism (`--skip-completed-on-retry`) with WIP intact.
- The genuine step-failure resume and main-loop residue guard remain byte-for-byte unchanged.
- **Failure behavior**:
  - If reaping the worker fails (PID already gone / `ESRCH`), treat it as already-reaped and continue exiting — never throw out of the signal handler, never block the parent's exit.
  - If the worker ignores SIGTERM, the SIGKILL after grace is the hard backstop; the parent still exits.
  - If the interrupted marker cannot be written (append failure), the handler still exits (matching today's `cycle.killed` best-effort try/catch); on the next run the resume path falls back to inferring `interrupted` from the `cycle.killed` tail terminal rather than crashing.
  - If the log tail is malformed/unreadable when classifying interrupted-vs-failed, degrade to the **existing** residue-gated behavior (fail-closed toward today's guard), never silently skip the guard for a real failure.
  - A tail that is a genuine step-failure terminal must **never** be misclassified as interrupted (no WIP-preserving bypass for real failures).

## Acceptance Criteria
- [ ] **(User benefit)** After SIGTERM/SIGINT to a running engine, the active `run-one` worker and its agent descendant are terminated — a test asserts no orphaned worker process survives the signal (bounded SIGTERM→grace→SIGKILL).
- [ ] **(User benefit)** A subsequent `cycle run` after a signal interruption **resumes** the interrupted cycle from where it stopped (skip-completed), with the dirty worktree intact, and emits **no** `failed_cycle_dirty_worktree` halt.
- [ ] A signal-interrupted cycle is recorded as interrupted/resumable (marker written and/or `InFlightCycle` surfaces `interrupted: true`); its WIP is present in the tree after the resume begins (never auto-discarded).
- [ ] A genuine step-failure cycle still halts/guards exactly as today — the residue guard and terminal-failure paths are unchanged for real failures (asserted by an unchanged failure-path test).
- [ ] **(Failure-path)** When the interrupted marker / log tail is unreadable or malformed, the resume path degrades to the existing residue-gated behavior (does not silently bypass the guard) and does not throw.
- [ ] **(Failure-path)** Reaping a worker whose PID is already gone (`ESRCH`) is a no-op that still lets the supervisor exit; the signal handler never throws.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- **Framework**: existing `node:test` suite (`--experimental-strip-types`), with the established conventions — cardinality-pin exactly-once events with `filter(predicate).length === 1`.
- **Worker reaping**: spawn a long-lived fake `run-one` (a sleep-like script via `CYCLE_*_BIN`/argv injection or a stub binary), signal the supervisor, and assert the child PID is dead within the grace window (`kill(pid, 0)` ⇒ `ESRCH`). Include the `ESRCH`/already-gone case as a no-throw no-op.
- **Interrupted classification**: unit-test `parseLogTail`/`InFlightCycle` over a log tail ending in `cycle.killed`/interrupted marker (⇒ `interrupted`) vs ending in a step-failure terminal (⇒ not interrupted), plus a malformed-tail case degrading to the existing path.
- **Resume with WIP**: drive the resume-from-tail block with an interrupted tail + a dirty (engine-non-owned) worktree; assert it does **not** emit `engine.halted{failed_cycle_dirty_worktree}`, calls `runResumeOnce` without teardown, and the WIP files remain. Re-run asserts the interrupted step executes on top of existing WIP.
- **Regression**: an in-flight tail that is a genuine terminal failure still arms the residue guard and halts unchanged.
- No UI changes — no E2E/Playwright required.

## Documentation Updates
- **CLAUDE.md**: extend the *Workflow defaults* / resume notes to document the suspend-and-resume behavior — signal reaps the worker; an interrupted cycle is resumable (WIP preserved, no `failed_cycle_dirty_worktree` halt); the residue guard remains the path for genuine failures only. Note the new interrupted marker / `InFlightCycle.interrupted` surface and the worker-reaping signal discipline.
- **docs/ENGINE.md**: add a *Signal interruption — suspend and resume* subsection describing worker reaping (bounded SIGTERM→grace→SIGKILL), the interrupted marker, and the interrupted-vs-failed resume branch.
- **README.md**: no user-facing CLI surface change beyond the documented pause/resume behavior; note pause-via-SIGTERM is safe if a resume/pause section exists, otherwise no change required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing supervisor signal handling (`src/cli.ts` ~228–242), `spawnRunOne` (`src/cli.ts` ~446), the resume-from-tail block + `haltIfResidue()` (`src/cli.ts` ~698–752), and `runResumeOnce`.
- `src/engine/log-tail.ts` (`InFlightCycle`, `parseLogTail`, `readLogTail`) for surfacing interrupted-vs-failed.
- The existing kill-grace discipline in `src/engine/exec-spawn.ts` / `walkthrough.ts` (`WALKTHROUGH_KILL_GRACE_MS`) as the pattern to mirror.
- No new external services or env vars.
