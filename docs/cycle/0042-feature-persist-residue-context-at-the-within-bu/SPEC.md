# SPEC — Cycle 0042: Persist Residue Context at the Within-Budget drainRetry Arm

## WHY
The failed-cycle dirty-worktree residue guard exists so a fresh engine process never stacks a new cycle on top of uncommitted residue left by a prior failed cycle. Cycle 0039 made the guard crash-safe across the four terminal-failure branches by mirroring `pendingResidueContext` to `.cycle/failed-residue-context.json`. But one loop-back path was left out: the within-budget `drainRetry` arm (cycle 0038, `src/cli.ts:871`) still arms the residue context **in memory only**. If the engine process crashes after a within-budget retry is queued but before it re-runs, the uncommitted residue is left on disk with no persisted context. A fresh engine start reads no context, skips the startup re-check, and silently stacks a new cycle on the dirty tree — the exact failure the guard was built to prevent. This is the last remaining durability hole; the engine docs and prior BUILD.md already flag it as the known limitation, but it was not yet a tracked fix.

## CONCRETE USER BENEFIT
An operator running the engine AFK can kill the process (or have it crash) at any point in the failure/retry loop — including the narrow window after a within-budget retry is queued — restart it, and trust that the engine will halt with the `failed_cycle_dirty_worktree` diagnostic instead of silently committing a new cycle's work on top of the abandoned residue. The residue guard now holds across *every* loop-back path, not just the terminal-failure branches.

## USABLE END-STATE
After this cycle, when a within-budget retry is armed and the engine is restarted before the retry runs, the fresh process reads `.cycle/failed-residue-context.json`, detects the residue, and halts cleanly at startup with the remediation diagnostic — identical behavior to a restart after any of the four terminal-failure branches. The "remaining limitation" note in the engine docs no longer applies.

## SCAFFOLDING ESCAPE HATCH
Not applicable — this cycle delivers a direct, observable resilience benefit (crash-safe halt on residue across the retry path).

## Objective
Close the last crash-safety gap in the failed-cycle dirty-worktree residue guard by persisting `pendingResidueContext` to disk at the within-budget `drainRetry` arm in `src/cli.ts`, mechanically symmetric to the four terminal-failure branches that cycle 0039 already persist. This makes the guard fully crash-safe across all loop-back paths so a crash mid-retry can no longer leave un-re-checked residue.

## Source Issue
`refl-0039-within-budget-drainretry-arm-leaves-no-p` — "Persist residue context at the within-budget drainRetry arm for crash-safe re-check"

## Scope

### In Scope
- Add `await persistResidue(pendingResidueContext);` adjacent to the existing in-memory set at the within-budget `drainRetry` arm (`src/cli.ts:871`), mirroring the four already-persisted terminal-failure branches.
- Add a regression test asserting the within-budget retry arm writes `.cycle/failed-residue-context.json` and that a simulated fresh engine start re-checks and halts on the residue.
- Update the doc note (CLAUDE.md / `docs/ENGINE.md`) that currently calls the within-budget retry arm out as the remaining un-persisted limitation.

### Out of Scope
- No new state file, no new event, no schema change — reuses `src/engine/residue-context-store.ts` and the existing `ResidueContext` shape.
- No change to the clear/delete sites — the existing success / noop / clean-tree clear transitions already key off the `pendingResidueContext` lifecycle and call `unpersistResidue()`; only verify coverage, do not add new delete calls unless a path is found uncovered.
- No change to the residue-detection, halt-emission, or remediation-diagnostic logic.

## Requirements
- The within-budget retry arm persists `pendingResidueContext` to `.cycle/failed-residue-context.json` via the existing `persistResidue` helper, immediately adjacent to the in-memory assignment, so the on-disk file and the in-memory context stay lock-step.
- The persisted file uses the unchanged atomic tmp+rename write and `ResidueContext` schema from `src/engine/residue-context-store.ts`.
- The existing clear sites must delete the persisted file on every clean-tree / success / noop transition that follows a within-budget retry, so a recovered retry does not leave a stale context file behind.
- **Failure behavior**: A write failure of the persisted file emits `engine.warning { reason: "residue_context_write_failed" }` and falls back to the in-memory-only guard (unchanged from cycle 0039) — it never throws and never fails the cycle. On a fresh start, a malformed/unreadable context file degrades to no-context with `engine.warning { reason: "residue_context_unreadable" }` and the file is deleted so the engine does not re-warn every start. A `git status` non-zero during the startup re-check halts (residue check failed, never coerced to "clean") rather than silently proceeding. The persist must never mask the retry's own failure routing.

## Acceptance Criteria
- [ ] Killing the engine after a within-budget retry is armed (before it re-runs) and restarting it causes the fresh process to read `.cycle/failed-residue-context.json`, detect the residue, and halt — the user-observable crash-safe halt across the retry path. (Regression test simulates this.)
- [ ] A regression test asserts that, after a failed cycle routed through the within-budget `drainRetry` arm, `.cycle/failed-residue-context.json` exists on disk with the expected `cycleId`/`issueId`/`failingStep`.
- [ ] A regression test asserts that a simulated fresh engine start on the persisted within-budget-retry context emits exactly one `engine.halted { reason: "failed_cycle_dirty_worktree" }` and the terminal `engine.stop { reason: "failed_cycle_dirty_worktree" }` (cardinality-pinned with `filter(...).length === 1`).
- [ ] **Failure-path**: A regression test asserts that when the context-file write fails at the within-budget retry arm, the engine emits `engine.warning { reason: "residue_context_write_failed" }`, does not throw, and continues with the in-memory guard intact.
- [ ] A regression test confirms the persisted file is deleted on the next clean-tree / success / noop clear transition following a within-budget retry (no stale file left behind).
- [ ] The CLAUDE.md / `docs/ENGINE.md` note no longer describes the within-budget retry arm as the remaining un-persisted limitation.
- [ ] Coverage does not decrease vs the master baseline; `src/cli.ts` per-file behavior covered.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node built-in test runner (`node:test`) with `--experimental-strip-types`, consistent with the existing residue-guard and `src/cli.ts` supervisor tests.
- **Happy path**: drive a cycle to within-budget failure (`row.attempt + 1 < maxAttempts`), assert the context file is written and re-checked on a fresh start. Mirror the existing four-branch persistence tests.
- **Failure paths**: simulated context-file write failure (assert `residue_context_write_failed` warning + in-memory fallback, no throw); malformed/unreadable file on fresh start (assert `residue_context_unreadable` warning + delete + degrade); clear-transition delete coverage.
- **Regression**: confirm the four terminal-failure branches and the resume/loop-top/startup re-check sites are byte-for-byte unchanged; confirm the clean-tree path emits no new event.
- No UI changes — no E2E tests required.

## Documentation Updates
- **CLAUDE.md**: update the *Failed-cycle dirty-worktree residue guard* section — remove the sentence stating "the within-budget retry arm is **not** persisted (in-process gate only)" and note it is now persisted, making the guard fully crash-safe across every loop-back path.
- **docs/ENGINE.md**: mirror the same update in the *Failed-cycle dirty-worktree residue guard* section.
- **README.md**: no user-facing surface change.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/residue-context-store.ts` (`persistResidue`/`unpersistResidue`/`deleteResidueContext`, atomic write, `ResidueContext` type) — already present.
- The `src/cli.ts` supervisor loop, `pendingResidueContext` lifecycle, `haltIfResidue()`/`emitResidueHalt()`, and `drainRetry` — already present (cycles 0036–0039).
- No external services or env vars beyond the existing `CYCLE_TRUNK_BASED` operating mode.
