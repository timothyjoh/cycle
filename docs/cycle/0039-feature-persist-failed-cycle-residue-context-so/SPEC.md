# SPEC — Cycle 0039: Persist Failed-Cycle Residue Context Across Engine Restarts

## WHY

The failed-cycle dirty-worktree residue guard (`src/engine/failed-residue-guard.ts` + `src/cli.ts`) is **in-process only**. Its `pendingResidueContext` lives in memory and is armed exclusively at terminal-failure branches within a single long-running supervisor process. The resume path arms from the log tail, but `readLogTail` only returns a tail for an *in-flight* cycle — a `cycle.start` with no matching `cycle.end`.

After a cycle that ended in **terminal failure** (`cycle.end {status:"failed"}` is present in the log), a full engine restart finds no in-flight tail, never arms `pendingResidueContext`, and the `while (!halted)` loop pops the next pending issue on top of any uncommitted residue with **no check**. For an AFK operator, "the engine died and I relaunched it" is the realistic recovery path — so the protection the guard exists to provide silently does not apply across the exact boundary where it matters most. In trunk mode (`CYCLE_TRUNK_BASED=1`) that residue sits directly on the base branch, and a fresh cycle stacks on top of it.

## CONCRETE USER BENEFIT

After this cycle, an operator who relaunches the engine following a terminal-failure cycle that left uncommitted residue will see the engine **halt at startup** with `engine.halted {reason:"failed_cycle_dirty_worktree"}` and a remediation diagnostic on stderr — instead of the engine silently building a new cycle on top of the dirty tree. The durability guarantee the guard advertises now holds across process death, not just within a single run.

## USABLE END-STATE

- Kill the engine after a cycle fails terminally and leaves residue; relaunch it. The engine stops before triage / before popping the next issue, names the dirty paths and the failed cycle id, and exits non-zero.
- Remediate the residue (commit / `git stash` / `git reset --hard`) and relaunch; the engine proceeds normally with no spurious halt, and the persisted context is cleared.
- The previously-documented caveat ("cross-process persistence … is **not** implemented this cycle (in-process only)") is removed from `docs/ENGINE.md` and `CLAUDE.md`.

## Objective

Close the cross-process gap in the failed-cycle dirty-worktree residue guard by persisting the in-memory `pendingResidueContext` to a `.cycle/failed-residue-context.json` state file at every terminal-failure branch, re-checking the worktree against that persisted context once at engine start (after lock/config load, before triage and before the first cycle), and clearing the file on the same success/noop/clean-tree transitions that clear the in-memory copy. This makes the guard trustworthy for unattended operation, where engine restart is the normal recovery path.

## Source Issue

`refl-0036-residue-guard-has-no-cross-process-re-ch` — "Persist failed-cycle residue context so the guard re-checks the worktree across engine restarts"

## Scope

### In Scope

- A persistence module for the residue context: write `.cycle/failed-residue-context.json` (carrying at least `cycleId`, `issueId`, `failingStep`), read-and-parse it tolerantly, and delete it. Malformed/unreadable JSON degrades to "no pending context" (optionally an `engine.warning`), never coercing a failed read into a silent proceed for a present-but-corrupt file.
- Wire persistence into `src/cli.ts`: write the file wherever `pendingResidueContext` is *set* at a terminal-failure branch, and delete it wherever `pendingResidueContext` is *cleared* (success / noop / clean-tree).
- A startup re-check in `src/cli.ts`: after lock/config load (and after `engine.start`), if the persisted context file is present, load it into `pendingResidueContext` and run the existing `haltIfResidue()` path **before** triage and before the resume/loop work begins. Residue present (or a `git status` failure) ⇒ the same `engine.halted {reason:"failed_cycle_dirty_worktree", …}` + terminal `engine.stop` + diagnostic on stderr + non-zero exit as the in-process gate. Clean tree ⇒ clear the file and proceed.

### Out of Scope

- The within-budget `drainRetry` residue gate — a separate recon-parity gap already closed in cycle 0038; not touched here.
- Any change to `readFailedCycleResidue` / `parseDirtyPaths` / `isEngineOwned` / `formatFailedCycleResidueDiagnostic` semantics — the startup re-check **reuses** these unchanged.
- Changing the in-process gate behavior (resume-path and loop-top checks) — those remain byte-for-byte as in cycle 0038; this cycle only adds a third, startup-time check fed by the persisted file.
- Migrating any other in-memory supervisor state to disk.

## Requirements

- The persisted state file lives under `.cycle/` (engine-owned; already excluded by `isEngineOwned`, so it can never itself trip the guard).
- The state file is written atomically enough that a crash mid-write does not leave a half-file that crashes startup: a present-but-unparseable file is tolerated at read time.
- The startup re-check runs **exactly once**, after lock acquisition and `loadConfig`, and **before** `runTriage` and before the in-flight-tail resume block — so a stacked cycle is prevented before any new work is dispatched. It must not fire when no state file is present.
- The startup re-check reuses the existing `haltIfResidue()` / `emitResidueHalt` machinery so the emitted `engine.halted` / `engine.stop` payloads and the stderr diagnostic are identical to the in-process gate (including `engineStopEmitted` suppression of the epilogue so exactly one terminal `engine.stop` fires).
- **Failure behavior**:
  - *Missing state file*: no pending context, no event, engine proceeds normally (the common clean-restart case).
  - *Malformed / unreadable / partial JSON in the state file*: degrade to no pending context (do not crash startup); surface it — an `engine.warning {reason: "residue_context_unreadable"}` (or equivalent) rather than a silent swallow. Rationale: a corrupt context file cannot tell us which cycle to attribute residue to, and crashing startup would be worse than proceeding; the in-memory gate plus the next terminal failure will re-arm. This is distinct from the `git status` non-zero case below.
  - *`git status` non-zero during the startup re-check*: treated as a halt (never coerced to "clean"), exactly as the existing `haltIfResidue` catch arm does — `dirty_paths: []`, `message: "Residue check failed…"`.
  - *State-file write failure at a terminal-failure branch*: best-effort — must not mask the terminal-failure routing or crash the supervisor; surface via an `engine.warning` and fall back to the existing in-memory-only behavior for that run.
  - *State-file delete failure on a clear transition*: best-effort; must not crash the success/noop path (a stale file at worst causes a redundant clean-tree re-check on the next start, which clears it).

## Acceptance Criteria

- [ ] **(User-observable benefit)** After a terminal-failure cycle leaves uncommitted residue, a fresh engine process (no in-flight log tail) reads `.cycle/failed-residue-context.json`, halts at startup with exactly one `engine.halted {reason:"failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths}`, writes the remediation diagnostic to stderr, and exits non-zero **before** any `cycle.start` or triage — verified by a test asserting `events.filter(e => e.event === "engine.halted" && e.reason === "failed_cycle_dirty_worktree").length === 1` and no `cycle.start` after it.
- [ ] On a terminal-failure branch, `.cycle/failed-residue-context.json` is written with the failed cycle id and issue id (verified by reading the file after the branch executes).
- [ ] On a clean restart (state file present, worktree clean), the engine proceeds normally, emits no residue `engine.halted`, and the state file is deleted (verified by asserting the file is absent after startup).
- [ ] On success/noop transitions that clear `pendingResidueContext`, the persisted state file is also deleted.
- [ ] **(Failure-path)** A present-but-malformed `.cycle/failed-residue-context.json` does not crash startup: the engine emits an `engine.warning` (reason indicating the context was unreadable), treats it as no pending context, and proceeds — verified by writing `"{ not json"` to the file and asserting startup completes without throwing and without a residue halt.
- [ ] **(Failure-path)** A `git status` non-zero during the startup re-check routes to a halt (not a silent proceed) with `dirty_paths: []` and a "Residue check failed" message, mirroring the in-process catch arm.
- [ ] `docs/ENGINE.md` and the `CLAUDE.md` *Failed-cycle dirty-worktree residue guard* note are updated to state that cross-process persistence is implemented (the "not implemented this cycle / in-process only … sole remaining recon-parity gap" caveat is removed/corrected, and the new state file + startup re-check are documented).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy

- **Framework**: existing `node:test` suite (`tests/`), run via `npm run test:coverage` (auto-builds; enforces per-file coverage floors and structural invariants).
- **New unit tests** for the persistence module: write→read round-trip; read of a missing file ⇒ undefined/no-context; read of malformed JSON ⇒ no-context (no throw); delete of a missing file ⇒ no throw.
- **New supervisor/integration tests** (mirroring existing residue-guard tests in `tests/`): 
  - *Happy-path-of-failure*: simulate a terminal-failure cycle that persists the context, then a fresh start with a dirtied tree ⇒ startup halt with the cardinality-pinned `engine.halted` and no subsequent `cycle.start`.
  - *Clean restart*: state file present, worktree clean ⇒ no halt, file deleted, engine proceeds.
  - *Malformed context*: corrupt file ⇒ `engine.warning` + proceed.
  - *`git status` failure during startup re-check* ⇒ halt with empty `dirty_paths`.
  - *Clear-on-success/noop*: assert the file is deleted on those transitions.
- **Cardinality discipline**: pin the startup `engine.halted` and terminal `engine.stop` emits with `filter(...).length === 1` (per Test conventions and the issue's explicit acceptance note), using `expectExactlyOne` where the payload is asserted.
- **Coverage**: hold per-file floors per policy; any new module added to `src/engine/` carries tests in this same cycle (register a floor in `scripts/coverage-gate.mjs` if the new module needs one).

## Documentation Updates

- **CLAUDE.md**: in the *Failed-cycle dirty-worktree residue guard* bullet, replace the "sole remaining recon-parity gap is cross-process persistence … not implemented (in-process only)" sentence with a description of the implemented `.cycle/failed-residue-context.json` startup re-check (persist at terminal-failure branches, re-check once at engine start, clear on success/noop/clean-tree, malformed ⇒ degrade-with-warning).
- **docs/ENGINE.md** (*Failed-cycle dirty-worktree residue guard* section): document the new state file, the third (startup) check site, the persist/clear lifecycle, and the malformed-file degrade behavior; remove the deferred-to-a-sibling-cycle caveat.
- **README.md**: no user-facing surface change beyond the engine note; no update required (the guard is internal durability behavior, not a CLI command).

Documentation is part of "done" — the caveat-removal is an explicit acceptance criterion, not follow-up.

## Dependencies

- Existing `src/engine/failed-residue-guard.ts` exports (`readFailedCycleResidue`, `formatFailedCycleResidueDiagnostic`, `isEngineOwned`, `ResidueContext`) — reused unchanged.
- Existing `src/cli.ts` supervisor structures: `pendingResidueContext`, `haltIfResidue()`, `emitResidueHalt()`, `engineStopEmitted`, the post-lock/`loadConfig` startup region (the `engine.start` emit at `src/cli.ts:223`), and every terminal-failure branch that sets `pendingResidueContext`.
- `.cycle/` directory exists at runtime (engine-owned; created by engine init). No external services or env vars required.
