# Implementation Plan: Cycle 0042

## Overview
Close the last crash-safety gap in the failed-cycle dirty-worktree residue guard by persisting `pendingResidueContext` to `.cycle/failed-residue-context.json` at the within-budget `drainRetry` arm in `src/cli.ts`, mechanically symmetric to the four already-persisted terminal-failure branches, so a crash mid-retry can no longer leave un-re-checked residue.

## Current State (from Research)
- The residue guard mirrors `pendingResidueContext` to `.cycle/failed-residue-context.json` via `persistResidue`/`unpersistResidue` (`src/cli.ts:250–271`), wrapping the atomic tmp+rename store in `src/engine/residue-context-store.ts`.
- Four terminal-failure branches set context *then* persist: commit-failed (`src/cli.ts:801–802`), fast-bail (`:858–859`), attempts-exhausted (`:883–884`), resume terminal (`:670–671`).
- The within-budget retry arm (`src/cli.ts:866–871`, `else if (row.attempt + 1 < maxAttempts)`) sets `pendingResidueContext = { cycleId, issueId: row.id, failingStep };` **in memory only** — the lone set-without-persist site. This is the gap.
- Clear sites set `undefined` then `await unpersistResidue()`: success drain (`:818–819`), no-op drain (`:774–775`), resume-ok/noop/skipped (`:661–662`/`:679–680`/`:683–684`), clean-tree branch inside `haltIfResidue()` (`:610–611`), startup corrupt-file drop (`:319`).
- Startup cross-process re-check (`:312–328`) reads `readResidueContext`; `corrupt` ⇒ `engine.warning { reason: "residue_context_unreadable" }` + `unpersistResidue()`; `ok` ⇒ loads context + `haltIfResidue()`.
- Loop-top gate (`:692–699`) and resume gate (`:643–688`) consume the in-memory context before doing new work.
- Tests live in `tests/cli/failed-residue-guard.test.ts`; `workflowYml(2, 2)` drives the within-budget retry arm, `workflowYml(2, 1)` drives terminal branches. The terminal-branch persistence test (`:558`) is the direct template for the new persistence test. Cross-process startup tests at `:428+`.

## Desired End State
- The within-budget retry arm calls `await persistResidue(pendingResidueContext);` immediately after the in-memory set, so the on-disk file and in-memory context stay lock-step across all five loop-back paths.
- A fresh engine start after a within-budget retry was armed (but before it re-ran) reads the context file, detects residue, and halts with `engine.halted`/`engine.stop { reason: "failed_cycle_dirty_worktree" }` — identical to a restart after any terminal-failure branch.
- New regression tests cover: file written at the within-budget arm; fresh-start halt on that persisted context; write-failure warning + in-memory fallback; clear-transition delete after a recovered retry.
- CLAUDE.md and `docs/ENGINE.md` no longer describe the within-budget retry arm as an un-persisted limitation; persist-site count updated from four to five.
- Verify: `npm test` green, `npm run typecheck` clean, coverage not decreased.

## What We're NOT Doing
- No new state file, event, or schema change — reuses `src/engine/residue-context-store.ts` and the existing `ResidueContext` shape.
- No new delete/clear call sites unless a recovered-retry clear path is found uncovered (it is not — `haltIfResidue()`'s clean-tree clear at `:610–611` and the success/noop drain deletes already cover it).
- No change to residue-detection, halt-emission, or remediation-diagnostic logic (`failed-residue-guard.ts`, `emitResidueHalt`, `haltIfResidue`).
- No change to the four already-persisted terminal-failure branches or the startup/loop-top/resume re-check sites (verified byte-for-byte unchanged).
- No README user-facing change; no E2E/UI tests.

## Implementation Approach
Single-line production change mirroring the established persist-adjacent-to-set pattern: insert `await persistResidue(pendingResidueContext);` after `src/cli.ts:871`. Because `persistResidue` is best-effort and never throws (it downgrades a write failure to `engine.warning { reason: "residue_context_write_failed" }`), the retry's own failure routing (`drainRetry` already ran) is never masked. All other crash-safety, clear, and re-check machinery already exists and is exercised — the work is the one persist call plus regression tests that pin the new behavior and confirm symmetry with the four persisted branches. Doc updates close the SPEC's documentation-is-part-of-done requirement.

## Failure & Resilience Decisions

**Task 1 — persist call at the within-budget arm:**
- **Failure modes**: the only new I/O is the `writeResidueContext` atomic tmp+rename inside `persistResidue`. A write failure (disk full, permission) is caught inside `persistResidue` (`src/cli.ts:250–271`), which emits `engine.warning { reason: "residue_context_write_failed", cycle_id, issue_id, error }` and returns — the guard degrades to in-memory-only (the pre-cycle behavior). It never propagates, never throws, never fails the cycle, and never masks the retry routing (`drainRetry` already completed before the persist call).
- **Idempotency**: safe to re-run. The write is atomic tmp+rename, so a crash mid-write leaves only an engine-owned `<path>.tmp` ignored by the read path. Re-arming the same context overwrites with identical content. On recovery, the next clean-tree/success/noop transition calls `unpersistResidue()` (ENOENT-swallowing idempotent unlink) so no stale file survives. `isEngineOwned`/`isDenied` exclude `.cycle/**`, so the state file can never itself trip the guard.
- **Observability**: success is silent (matching the four existing branches); failure emits the structured `residue_context_write_failed` warning to `.cycle/log.jsonl`. The downstream halt path emits `engine.halted`/`engine.stop { reason: "failed_cycle_dirty_worktree" }`.
- **No silent failure**: the write-failure path surfaces an `engine.warning` event; the degraded in-memory guard still halts a same-process loop-top/resume re-check. Only a cross-process crash *after* a write failure loses the guard — which is exactly the pre-existing degraded behavior the warning announces.

**Tasks 2–5 (tests) and Task 6 (docs):** N/A — pure (tests) / documentation only.

---

## Task 1: Persist residue context at the within-budget drainRetry arm

### Overview
Add the missing `await persistResidue(...)` call so the within-budget retry arm mirrors the four terminal-failure branches.

### Changes Required
**File**: `src/cli.ts`
**Changes**: In the `else if (row.attempt + 1 < maxAttempts)` branch (currently `:866–871`), after the in-memory set, add the persist call mirroring `:883–884`:

```ts
    } else if (row.attempt + 1 < maxAttempts) {
      await drainRetry(cwd, log, cycleId, row.id, failingStep);
      // retry-drain: counter unchanged; popNextPending will see the row again with attempt++.
      // Residue-gate the retry: if this failed attempt dirtied the tree, the loop-top
      // haltIfResidue() halts before drainRetry's re-run executes on top of it.
      // Persist the context (cycle 0042) so a crash before the retry re-runs is still
      // re-checked on a fresh start — symmetric with the four terminal-failure branches.
      pendingResidueContext = { cycleId, issueId: row.id, failingStep };
      await persistResidue(pendingResidueContext);
    } else {
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`)
- [ ] `npm run typecheck` clean
- [ ] After a `workflowYml(2, 2)` cycle fails into the within-budget arm, `.cycle/failed-residue-context.json` exists
- [ ] Failure path: a `persistResidue` write failure emits `residue_context_write_failed` and does not throw (covered by Task 4)

---

## Task 2: Regression test — within-budget retry arm persists context to disk

### Overview
Assert the file is written with the correct `cycleId`/`issueId`/`failingStep` after a cycle routes through the within-budget retry arm.

### Changes Required
**File**: `tests/cli/failed-residue-guard.test.ts`
**Changes**: New test modeled on the terminal-branch persistence test (`:558`), swapping `workflowYml(2, 1)` → `workflowYml(2, 2)` and using the `RESIDUE_SCRIPT` fixture so the failed attempt dirties the tree with `src/residue.ts`. Drive one engine run; because `workflowYml(2, 2)` takes the within-budget path on the first failure, the loop-top `haltIfResidue()` halts before the retry re-runs. Assert `contextExists()` is true and the parsed JSON has `cycleId`, `issueId` (the seeded todo id), and `failingStep: "verify"`.

### Success Criteria
- [ ] Test fails without Task 1, passes with it
- [ ] Asserts file existence and all three persisted fields
- [ ] Exactly one `cycle.start` (retry did not re-run), cardinality-pinned

---

## Task 3: Regression test — fresh start on within-budget-retry context halts

### Overview
Simulate a crash-and-restart: with the persisted within-budget-retry context on disk and a dirty tree, a fresh engine start re-checks and halts.

### Changes Required
**File**: `tests/cli/failed-residue-guard.test.ts`
**Changes**: New test modeled on "startup re-check halts on persisted context + dirty tree" (`:428`). Use `writeContext()` to seed `.cycle/failed-residue-context.json` with a within-budget-retry-shaped context, leave a residue file (`src/residue.ts`) uncommitted in the worktree, run the engine, parse `.cycle/log.jsonl` via `readEvents()`. Assert exactly one `engine.halted { reason: "failed_cycle_dirty_worktree" }` (with `dirty_paths` including `src/residue.ts`) and exactly one terminal `engine.stop { reason: "failed_cycle_dirty_worktree" }`, both pinned with `filter(...).length === 1`. Assert no `cycle.start` fired (no new cycle stacked).

### Success Criteria
- [ ] Exactly-one `engine.halted` and `engine.stop` cardinality-pinned
- [ ] `dirty_paths` includes the residue path
- [ ] No `cycle.start` after the halt

---

## Task 4: Failure-path test — write failure at the within-budget arm warns and falls back

### Overview
Assert that when the context-file write fails at the within-budget retry arm, the engine emits `engine.warning { reason: "residue_context_write_failed" }`, does not throw, and the in-memory guard still halts the loop-top re-check.

### Changes Required
**File**: `tests/cli/failed-residue-guard.test.ts`
**Changes**: Force a write failure of `.cycle/failed-residue-context.json` while keeping the rest of `.cycle/` writable. Preferred mechanism (per CLAUDE.md test conventions, since `node:fs/promises` cannot be `mock.method`-stubbed): make the target path un-writable via real filesystem manipulation — pre-create `.cycle/failed-residue-context.json` as a **directory** (so the atomic `rename` over it fails) before the engine run, using the `RESIDUE_SCRIPT` + `workflowYml(2, 2)` fixture so the within-budget arm fires. Parse events: assert exactly one `engine.warning { reason: "residue_context_write_failed" }`, that the process did not crash (engine exits through the normal in-memory residue halt — the loop-top `haltIfResidue()` still fires on the in-memory context), and that the run did not throw an unhandled error (engine still emits the `engine.halted`/`engine.stop` from the in-memory guard).
- If the directory-collision approach proves brittle against the atomic-write tmp path, fall back to `chmod 0o500` on `.cycle/` after seeding but before the run — documented in the test comment as the rationale, consistent with the `dot-env.test.ts` real-fs precedent.

### Success Criteria
- [ ] Exactly one `residue_context_write_failed` warning, pinned
- [ ] Engine does not throw / crash; exit is the clean residue halt
- [ ] In-memory guard still produces the `engine.halted`/`engine.stop` halt this same process

---

## Task 5: Regression test — clear transition deletes the file after a recovered within-budget retry

### Overview
Confirm no stale context file survives when a recovered within-budget retry reaches a clean-tree/success/noop clear transition (Acceptance Criteria item 5).

### Changes Required
**File**: `tests/cli/failed-residue-guard.test.ts`
**Changes**: Seed `.cycle/failed-residue-context.json` with a within-budget-retry-shaped context but leave the worktree **clean** (no residue), so the startup re-check's clean-tree branch inside `haltIfResidue()` (`:610–611`) fires `unpersistResidue()`. Run the engine; assert `contextExists()` is false after the run and that the engine proceeds (a `cycle.start` fires, no `failed_cycle_dirty_worktree` event). This exercises the existing clear path that covers a recovered within-budget retry; it confirms the existing delete sites suffice (no new delete call needed per SPEC Out-of-Scope).

### Success Criteria
- [ ] Context file deleted after the clean-tree clear transition
- [ ] No `failed_cycle_dirty_worktree` event; engine proceeds normally
- [ ] No new production delete call introduced

---

## Task 6: Update documentation (CLAUDE.md + docs/ENGINE.md)

### Overview
Remove the "within-budget retry arm is not persisted" limitation note and update the persist-site count from four to five.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: In the *Failed-cycle dirty-worktree residue guard* note, remove the final sentence "The remaining limitation is that the within-budget retry arm is **not** persisted (in-process gate only)." Update the persistence-scope description from "persisted at the four terminal-failure branches" to "persisted at the four terminal-failure branches **and the within-budget retry arm** (five persist sites), so the guard is crash-safe across every loop-back path."

**File**: `docs/ENGINE.md`
**Changes**: In the *Failed-cycle dirty-worktree residue guard* section: (1) at the cross-process persistence paragraph (`:70`), change "persists at the four terminal-failure branches" → "persists at the four terminal-failure branches and the within-budget retry arm (five sites)"; (2) remove the "**Remaining known limitation:** the within-budget retry arm is **not** persisted to disk…" paragraph (`:76`); (3) ensure the three-gated-paths description (`:68`) reads consistently with the now-persisted retry arm.

### Success Criteria
- [ ] No doc sentence describes the within-budget retry arm as un-persisted
- [ ] Persist-site count reads "five" / "four terminal-failure branches and the within-budget retry arm" consistently in both files
- [ ] `docs/ENGINE.md` and CLAUDE.md agree

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] Killing the engine after a within-budget retry is armed (before it re-runs) and restarting it causes the fresh process to read `.cycle/failed-residue-context.json`, detect the residue, and halt — the user-observable crash-safe halt across the retry path. (Regression test simulates this.) | Task 1, Task 3 | Task 1 persists; Task 3 simulates the restart halt |
| [ ] A regression test asserts that, after a failed cycle routed through the within-budget `drainRetry` arm, `.cycle/failed-residue-context.json` exists on disk with the expected `cycleId`/`issueId`/`failingStep`. | Task 2 | |
| [ ] A regression test asserts that a simulated fresh engine start on the persisted within-budget-retry context emits exactly one `engine.halted { reason: "failed_cycle_dirty_worktree" }` and the terminal `engine.stop { reason: "failed_cycle_dirty_worktree" }` (cardinality-pinned with `filter(...).length === 1`). | Task 3 | |
| [ ] **Failure-path**: A regression test asserts that when the context-file write fails at the within-budget retry arm, the engine emits `engine.warning { reason: "residue_context_write_failed" }`, does not throw, and continues with the in-memory guard intact. | Task 4 | |
| [ ] A regression test confirms the persisted file is deleted on the next clean-tree / success / noop clear transition following a within-budget retry (no stale file left behind). | Task 5 | |
| [ ] The CLAUDE.md / `docs/ENGINE.md` note no longer describes the within-budget retry arm as the remaining un-persisted limitation. | Task 6 | |
| [ ] Coverage does not decrease vs the master baseline; `src/cli.ts` per-file behavior covered. | Task 2, Task 3, Task 4, Task 5 | New tests exercise the added persist line and its failure path |
| [ ] All existing tests still pass. | Task 1–6 | `npm test` gate; existing within-budget and terminal-branch tests unchanged |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1 | |

---

## Testing Strategy

### Unit Tests
- The store-level behavior (`writeResidueContext`/`readResidueContext`/`deleteResidueContext`) is already covered in `tests/engine/residue-context-store.test.ts` — no new store unit tests needed; this cycle adds no store code.
- Failure-path tests:
  - **Write failure** (Task 4): force the atomic write to fail (target path pre-created as a directory, or `.cycle/` chmod `0o500`), assert `residue_context_write_failed` warning + no throw + in-memory halt still fires.
  - **Malformed/unreadable on fresh start**: already covered by the existing "malformed persisted context warns and proceeds" test (`:502`); confirm it still passes (regression).
  - **`git status` non-zero during startup re-check**: already covered by "git-status failure during startup re-check halts" (`:530`); confirm regression.
- Mocking strategy: prefer real filesystem manipulation (real git repo via `bootstrapRepo()`, real `.cycle/log.jsonl` parsing via `readEvents()`, real un-writable path for the write-failure case) over mocks — consistent with the existing residue-guard suite and the CLAUDE.md note that `node:fs/promises` cannot be `mock.method`-stubbed.

### Integration / E2E Tests
- All new tests are end-to-end engine runs: `bootstrapRepo()` + `seedTodo()` + `workflowYml(2, 2)` (within-budget arm) or `writeContext()` (simulated fresh start), driving the built `dist/cycle.js` and parsing `.cycle/log.jsonl`.
- Symmetry/regression: confirm the four terminal-failure-branch persistence test (`:558`) and the cross-process startup tests (`:428+`) still pass unchanged, and the clean-tree within-budget test (`:348`) emits no new event.
- No UI surface → no browser/E2E required (per SPEC Testing Strategy).

## Risk Assessment
- **Write-failure test flakiness** (directory-collision vs atomic tmp+rename interaction): mitigated by the documented `chmod 0o500` fallback approach with a precedent in `dot-env.test.ts`; the test asserts on the emitted warning event, not on internal write mechanics.
- **Doc-count drift** (persist-site count cited as "four" elsewhere): mitigated by Task 6 updating both `docs/ENGINE.md:70` and the CLAUDE.md note in one pass and grepping for remaining "four" references in the residue-guard sections.
- **Coverage of the new persist line**: the within-budget arm's persist call and its write-failure branch are both directly exercised by Tasks 2–4, keeping `src/cli.ts` line/branch coverage from regressing.
