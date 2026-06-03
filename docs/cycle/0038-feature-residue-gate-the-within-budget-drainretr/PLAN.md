# Implementation Plan: Cycle 0038

## Overview
Close the within-budget retry gap in the failed-cycle dirty-worktree residue guard by arming `pendingResidueContext` on the within-budget retry arm in `src/cli.ts`, so the existing loop-top `haltIfResidue()` halts before `drainRetry`'s re-run executes against a dirty tree.

## Current State (from Research)
- The residue guard (cycle 0036) arms its in-memory `pendingResidueContext = { cycleId, issueId: row.id, failingStep }` at every **terminal** failure branch: commit-failed (`src/cli.ts:725`), fast-bail (`:780`), attempts-exhausted (`:801`), and the resume terminal path (`:598`). Success/noop/clean-tree paths clear it to `undefined`.
- The **within-budget retry arm** at `src/cli.ts:787-789` (`else if (row.attempt + 1 < maxAttempts) { await drainRetry(...) }`) is the lone failure branch that does **not** set `pendingResidueContext`. It loops back to the top of `while (!halted)` with the context unset, so the loop-top `haltIfResidue()` (`:621-625`) is a no-op and the retry re-runs on the dirty tree.
- `haltIfResidue()` (`:527-547`) is a no-op when the context is unset; on residue it calls `emitResidueHalt` (`:549-571`) which emits exactly one `engine.halted { reason: "failed_cycle_dirty_worktree", ... }` + the terminal `engine.stop`, sets `engineStopEmitted = true`, and writes the diagnostic to stderr. On a `git status` throw it halts with `dirty_paths: []` + `"Residue check failed after cycle <id>: <err>"`. A clean tree clears the context and returns `false`.
- A structural invariant pins **exactly two** `await haltIfResidue()` calls in `src/cli.ts` (`scripts/structural-invariants.mjs:45-51`, `expected: 2`). The fix must arm the context, **not** add a third call.
- `isEngineOwned` (`src/engine/failed-residue-guard.ts:39-45`) excludes `.cycle/**`, `docs/cycle/**`, and `isDenied` paths — so `drainRetry`'s issue-lifecycle move never trips the guard.
- Test harness: `tests/cli/failed-residue-guard.test.ts` spawns the built `dist/cycle.js` against a real temp git repo. Existing tests use `workflowYml(2, 1)` (`maxCycleAttempts: 1`), which forces every failure to the **terminal** branch — so none exercise `:787`. Reusable fixtures: `RESIDUE_SCRIPT`, `ENGINE_OWNED_SCRIPT`, `GIT_FAILURE_SCRIPT`, `CLEAN_FAIL_SCRIPT` (`:96-121`).

## Desired End State
- `src/cli.ts:787-789` sets `pendingResidueContext = { cycleId, issueId: row.id, failingStep }` immediately around the `drainRetry` call, mirroring the terminal branches' assignment shape.
- A within-budget retry that left non-engine-owned `src/**` residue halts at the next loop-top with a single `engine.halted { reason: "failed_cycle_dirty_worktree" }` + terminal `engine.stop` + stderr diagnostic + non-zero exit, **before** the retry re-runs.
- A clean-tree within-budget retry, an engine-owned-only retry, behave byte-for-byte unchanged.
- `npm test`, `npm run typecheck`, `npm run check:invariants`, `npm run check:coverage` all pass (the `haltIfResidue` count invariant still reads `2`).
- `docs/ENGINE.md` and `CLAUDE.md` document the within-budget retry as a third gated site and narrow the remaining recon-parity gap to cross-process restart re-check only.

## What We're NOT Doing
- No cross-process persistence of the residue context across full engine restarts (`.cycle/failed-residue-context.json` startup re-check) — explicitly the still-open recon-parity gap.
- No change to `src/engine/failed-residue-guard.ts` (`isEngineOwned`, `readFailedCycleResidue`, `parseDirtyPaths`, `formatFailedCycleResidueDiagnostic`, `ResidueContext`).
- No change to the two existing gated sites (resume-path `:581`, loop-top `:621`), `emitResidueHalt`, the halt event shape, or `engineStopEmitted`.
- No new halt reason, no new `haltIfResidue()` call, no new pre-`drainRetry` check function.
- No `README.md` change — the guard is internal engine behavior.

## Implementation Approach
The fix is a one-line context assignment on the within-budget retry arm, mirroring `src/cli.ts:780` / `:801`. The consuming machinery (loop-top `haltIfResidue()`, `emitResidueHalt`, engine-owned exclusion, git-failure handling) already exists and is reused unchanged — so the retry path inherits identical halt semantics to resume and next-issue. Because `drainRetry` does **not** call `recordTerminalFailure`, arming the context does not touch `consecutiveFailures`/`failedCycles`/`lastHaltContext`/fast-fail counters; the halt is driven solely by the residue guard, not `max_consecutive_failures`. Tests use the existing `dist`-spawning harness with `maxCycleAttempts >= 2` to reach `:787`, reusing the cycle-0036 bash fixtures and the `filter(...).length === 1` cardinality-pin convention.

## Failure & Resilience Decisions

**Task 1 (arm context on retry arm):** N/A — pure in-memory assignment of a plain object to a closure-scoped variable; no I/O, subprocess, or filesystem write. The failure surface it *enables* (residue detection) is owned by the already-existing, unchanged `haltIfResidue()`/`readFailedCycleResidue` path:
- **Failure modes**: residue present → `haltIfResidue` returns `true`, supervisor sets `halted = true`, emits halt + stop, exits non-zero (no retry runs). `git status` non-zero → `readFailedCycleResidue` **throws**, `haltIfResidue` catches and halts with `dirty_paths: []` + `"Residue check failed…"` — never coerced to "clean". Clean tree → context cleared, retry proceeds.
- **Idempotency**: `pendingResidueContext` is an in-memory dedup guard checked once per loop iteration; re-running the supervisor re-derives it from the failure branch. The within-budget retry itself is made re-run-safe by the guard halting before `drainRetry`'s re-run touches the dirty tree. Setting the context is idempotent (last-write-wins of an identical-shaped object).
- **Observability**: the halt emits structured JSONL `engine.halted` + `engine.stop` to `.cycle/log.jsonl` and writes `formatFailedCycleResidueDiagnostic` to stderr — same diagnostics as the two existing gated sites.
- **No silent failure**: residue or a failed check surfaces via `engine.halted` + stderr + non-zero exit; nothing is swallowed. A clean tree is the only path that proceeds, and it explicitly clears the context.

**Task 2 (tests):** N/A — test code. Drives real subprocess + real temp git repo via the existing harness; no new failure surface introduced.

**Task 3 (docs):** N/A — Markdown edits, no runtime surface.

---

## Task 1: Arm `pendingResidueContext` on the within-budget retry arm

### Overview
Set the residue-guard context on the `else if (row.attempt + 1 < maxAttempts)` arm in `src/cli.ts` so the next loop-top `haltIfResidue()` detects residue from the just-failed attempt before `drainRetry`'s re-run.

### Changes Required
**File**: `src/cli.ts` (the within-budget retry arm, currently `:787-789`)
**Changes**: Add the context assignment after the `drainRetry` call, mirroring `:780` / `:801`:

```ts
} else if (row.attempt + 1 < maxAttempts) {
  await drainRetry(cwd, log, cycleId, row.id, failingStep);
  // retry-drain: counter unchanged; popNextPending will see the row again with attempt++.
  // Residue-gate the retry: if this failed attempt dirtied the tree, the loop-top
  // haltIfResidue() halts before drainRetry's re-run executes on top of it.
  pendingResidueContext = { cycleId, issueId: row.id, failingStep };
}
```

This adds **no** `haltIfResidue()` call (structural invariant `expected: 2` preserved) and **no** call to `recordTerminalFailure` (counters untouched, consistent with the retry path's existing semantics). The `failingStep` variable is already in scope in this branch (used by `drainRetry` and the sibling terminal branches).

### Success Criteria
- [ ] `npm run build` / `npm run typecheck` compile cleanly, no warnings.
- [ ] `npm run check:invariants` passes — `await haltIfResidue()` still appears exactly twice.
- [ ] The within-budget retry arm sets `pendingResidueContext` with `{ cycleId, issueId: row.id, failingStep }`.
- [ ] Failure paths behave as designed: residue/`git`-failure halt loudly via the unchanged `haltIfResidue` path; clean tree clears context and proceeds.

---

## Task 2: Tests for the within-budget retry residue gate

### Overview
Add tests to `tests/cli/failed-residue-guard.test.ts` proving the gap is closed (residue halt before retry re-run), the git-failure path halts, and clean-tree / engine-owned-only retries are unchanged — all with `maxCycleAttempts >= 2` so `:787` is reached.

### Changes Required
**File**: `tests/cli/failed-residue-guard.test.ts`
**Changes**: Add tests reusing the existing `bootstrapRepo` / `seedTodo` / `workflowYml` / `readEvents` helpers and the `RESIDUE_SCRIPT` / `GIT_FAILURE_SCRIPT` / `ENGINE_OWNED_SCRIPT` / `CLEAN_FAIL_SCRIPT` fixtures. Use `workflowYml(2, 2)` (`maxConsecutiveFailures: 2`, `maxCycleAttempts: 2`) so the first failure takes the within-budget arm (`0 + 1 < 2`) and the residue guard — not `max_consecutive_failures` — is what halts (the retry arm never calls `recordTerminalFailure`, so `consecutiveFailures` stays `0`).

1. **Happy path (gap closed)** — `RESIDUE_SCRIPT` (writes `src/residue.ts`, `exit 1`) with `workflowYml(2, 2)`:
   - Assert exactly one `engine.halted { reason: "failed_cycle_dirty_worktree" }` via `events.filter(e => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree").length === 1`.
   - Assert the retry attempt does **not** re-run: `events.filter(e => e.event === "cycle.start").length === 1` (resolving RESEARCH open question 1 — assert the single-`cycle.start` count, the available harness signal, matching the loop-path test at `:146-147`).
   - Assert exactly one terminal `engine.stop { reason: "failed_cycle_dirty_worktree" }` (`filter(...).length === 1`).

2. **Failure path (git-status non-zero)** — `GIT_FAILURE_SCRIPT` with `workflowYml(2, 2)`:
   - Assert one `engine.halted { reason: "failed_cycle_dirty_worktree" }` with `dirty_paths` deep-equal `[]` and `message` matching `/^Residue check failed/`.

3. **Regression — clean-tree retry unchanged** — `CLEAN_FAIL_SCRIPT` with `workflowYml(2, 2)`:
   - Assert **no** `failed_cycle_dirty_worktree` `engine.halted` and no residue `engine.stop` fires; the retry proceeds (the eventual terminal outcome after the retry exhausts budget is the existing non-residue path).

4. **Regression — engine-owned-only retry no-trip** — `ENGINE_OWNED_SCRIPT` with `workflowYml(2, 2)`:
   - Assert **no** `failed_cycle_dirty_worktree` halt fires (the `docs/cycle/**` + `.cycle/run.log` writes are engine-owned-excluded).

### Success Criteria
- [ ] All four new tests pass under `npm test`.
- [ ] All exactly-once engine events asserted with `filter(predicate).length === 1`, never bare `find`.
- [ ] Existing tests in the file (loop-path, resume-path, engine-owned, clean-tree, git-failure) still pass unchanged.
- [ ] `npm run check:coverage` passes — global floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) hold; the new retry-arm branch in `src/cli.ts` is exercised.

---

## Task 3: Documentation updates

### Overview
Update `docs/ENGINE.md` and `CLAUDE.md` to record the within-budget retry as a third gated site and narrow the remaining recon-parity gap to cross-process restart only.

### Changes Required
**File**: `docs/ENGINE.md` — *Failed-cycle dirty-worktree residue guard* section (around `:60-72`)
**Changes**: Change the "Both gated paths" wording to enumerate **three** gated sites (resume path, loop-top, **within-budget retry arm**). Replace the "Recon-parity retry gap" line: the within-budget `drainRetry` gap is now closed; the remaining recon-parity gap is **cross-process restart re-check only** (`.cycle/failed-residue-context.json`).

**File**: `CLAUDE.md` — *Failed-cycle dirty-worktree residue guard* summary line under *Workflow defaults*
**Changes**: Remove the caveat "the within-budget `drainRetry` path is **not** residue-gated (recon-parity gap)". State that the within-budget retry path is now gated (a third arm alongside resume and loop-top) and that the remaining recon-parity gap is cross-process restart only. Update the "Gated at **two sites**" phrasing in the same paragraph to "three sites" / the within-budget arm.

### Success Criteria
- [ ] `docs/ENGINE.md` states the within-budget `drainRetry` gap is closed and names the third gated site.
- [ ] `CLAUDE.md` no longer claims the within-budget retry path is ungated; the remaining gap is narrowed to cross-process restart.
- [ ] Both docs reference the same halt event/exclusion semantics (no behavioral drift in the prose).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **(user-observable benefit)** A test simulating a within-budget retry (`row.attempt + 1 < maxAttempts`) where the failed attempt left uncommitted, non-engine-owned `src/**` residue halts with `engine.halted { reason: "failed_cycle_dirty_worktree" }` **before** `drainRetry` re-runs the cycle on the dirty tree — cardinality-pinned with `filter(...).length === 1`. | Task 1, Task 2 | Test scenario 1 (`RESIDUE_SCRIPT`, `workflowYml(2, 2)`) |
| [ ] The same halt path emits the terminal `engine.stop` (suppressing the epilogue's via `engineStopEmitted`, so exactly one `engine.stop` fires) and writes the remediation diagnostic to stderr. | Task 1, Task 2 | Reuses unchanged `emitResidueHalt`; test scenario 1 asserts single `engine.stop` |
| [ ] **(failure-path)** A within-budget retry where the residue check fails (`git status` non-zero) halts with `failed_cycle_dirty_worktree`, `dirty_paths: []`, and a `"Residue check failed…"` message rather than proceeding — the failed check is not coerced to "clean". | Task 2 | Test scenario 2 (`GIT_FAILURE_SCRIPT`) |
| [ ] A clean-tree within-budget retry proceeds byte-for-byte unchanged: no `engine.halted`/`engine.stop` residue event fires, and `drainRetry` re-runs as before. | Task 1, Task 2 | Test scenario 3 (`CLEAN_FAIL_SCRIPT`) |
| [ ] A within-budget retry whose only worktree changes are engine-owned (e.g. `docs/cycle/**` issue-lifecycle move performed by `drainRetry`, `.cycle/**` state) does **not** trip the guard. | Task 2 | Test scenario 4 (`ENGINE_OWNED_SCRIPT`); `isEngineOwned` unchanged |
| [ ] `docs/ENGINE.md` *Failed-cycle dirty-worktree residue guard* note states the within-budget `drainRetry` gap is closed and narrows the remaining recon-parity gap to cross-process restart only. | Task 3 | |
| [ ] All existing tests still pass. | Task 2 | `npm test` full suite |
| [ ] No compiler/linter warnings introduced. | Task 1 | `npm run typecheck` clean |

---

## Testing Strategy

### Unit Tests
- The change is a single in-memory assignment with no isolated pure-function surface; it is validated at the supervisor-loop level via the CLI harness (the consuming `haltIfResidue` path is already unit-tested in `tests/engine/failed-residue-guard.test.ts`, out of scope here).

### Integration / E2E Tests
- All four scenarios in Task 2 run against the real `dist/cycle.js` + a real temp git repo via the existing `spawnSync("node", [dist, "run"], { cwd: root })` harness — no mocking; the failure shape is driven by real bash-script fixtures.
- Failure-mode coverage map: **residue present** → scenario 1; **`git status` non-zero / git missing** → scenario 2; **clean tree (no failure surface tripped)** → scenario 3; **engine-owned-only changes (exclusion predicate)** → scenario 4.
- Mocking strategy: none required — the harness already exercises the real engine end-to-end. Flagged: the only "simulation" is selecting the bash fixture that produces each worktree state; this is the established cycle-0036 pattern.

### Integration with structural/coverage gates
- `npm run check:invariants` confirms the `haltIfResidue` `expected: 2` invariant is not violated by the fix.
- `npm run check:coverage` confirms the new retry-arm branch is covered and global floors hold.

## Risk Assessment
- **Risk: accidentally adding a third `haltIfResidue()` call** (e.g. by copying a terminal branch wholesale) → violates the `expected: 2` structural invariant. **Mitigation:** the fix is a context assignment only; `npm run check:invariants` catches a regression deterministically.
- **Risk: test halts on `max_consecutive_failures` instead of the residue guard**, masking the gap-closure assertion. **Mitigation:** use `workflowYml(2, 2)` — the within-budget retry arm does **not** call `recordTerminalFailure`, so `consecutiveFailures` stays `0` and the loop-top residue guard is the sole halt cause; assert the halt `reason` is `failed_cycle_dirty_worktree`, never `max_consecutive_failures`.
- **Risk: doc drift between `CLAUDE.md` and `docs/ENGINE.md`** on the gated-site count. **Mitigation:** Task 3 updates both in the same cycle with identical "three gated sites / cross-process-restart-only gap" wording.
