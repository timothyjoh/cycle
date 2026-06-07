# SPEC — Cycle 0264: Hold engine lock for full run lifetime; reject concurrent run before preflight

## WHY
Starting a second `cycle run` against a repo that already has a live engine is not cleanly rejected today. The second invocation slips past the PID lockfile, proceeds through `engine.start → preflight → triage`, then residue-halts (`engine.halted { reason: "failed_cycle_dirty_worktree" }`) because it observes the first engine's in-flight dirty tree. This has two consequences: (1) two engines can run against the same repo and commit to the same branch — a state-corruption risk in trunk mode — and (2) the rejected run writes a misleading `engine.halted` / `engine.stop halted` as the last line of the shared `log.jsonl`, making a still-running engine look dead. Observed in practice: supervisor pid 2433491 was mid-cycle 0263 (`fix`) with **no `.cycle/engine.lock` on disk**, and a second `run` from another session ran to a residue-halt at 00:27 instead of being turned away with `engine already running`.

## CONCRETE USER BENEFIT
A user who accidentally launches a second `cycle run` on a repo that already has one running sees an immediate, clear rejection — `engine already running, pid X` on stderr and a dedicated non-zero exit code — and the first engine's `log.jsonl` is left completely untouched (no spurious `engine.halted`/`engine.stop` from the rejected attempt). The user can trust that exactly one engine ever drives a repo, and that the log tail always reflects the real live engine, not a turned-away duplicate.

## USABLE END-STATE
While a `cycle run` is active, `.cycle/engine.lock` is present on disk and holds the live supervisor's PID for the entire run. A second `cycle run` on the same repo exits immediately and cleanly before any engine event is emitted. A stale lock left by a dead process is silently reclaimed so a fresh run after a crash still works. The first engine's lock is never deleted by a rejected concurrent run.

## Objective
This cycle makes the engine PID lock effective for its stated contract: held on disk for the full run lifetime, checked early enough that a concurrent `run` is rejected **before** `engine.start`, preflight, triage, and the residue check ever execute, and reclaimed correctly when stale. The root cause of the current ineffectiveness (lock not surviving the run, an overlapping teardown clearing it, or a cwd/path-resolution mismatch between sessions) must be diagnosed and fixed, not merely papered over.

## Source Issue
`fix-engine-lock-not-held-concurrent-run` — "Hold engine lock for full run lifetime; reject concurrent run cleanly before preflight"

## Scope

### In Scope
- Diagnose and fix why `.cycle/engine.lock` is not held on disk for the supervisor's full run lifetime (it must be created at supervisor start and removed only when the supervisor itself exits), so a concurrent `run` always observes a live lock. Confirm which of the issue's three hypotheses is true (overlapping teardown firing `releaseLock`; lock lost/overwritten across the run; or a cwd/mount path-resolution mismatch producing divergent lock paths) and document the finding.
- Ensure a concurrent `run` against a live lock is rejected **before** any engine event is emitted — no `engine.start`, preflight, triage, `engine.halted`, or `engine.stop` written by the rejected run — exiting with `engine already running, pid X` on stderr and a distinct, dedicated exit code reserved for this rejection.
- Preserve and verify the stale-lock reclaim (dead PID ⇒ overwrite and proceed) and the `releaseLock` PID-match guard (a rejected run never deletes the owner's lock).

### Out of Scope
- Cross-machine / distributed locking — the single-host PID lockfile remains the contract.
- The resume-teardown-on-restart fix (separate issue `fix-resume-teardown-before-residue-halt`); with the lock fixed, a concurrent run never reaches the residue check, so the two no longer compound.
- Any change to the residue guard's own behavior.

## Requirements
- The lock is acquired at supervisor start and the lockfile is present on disk holding the live supervisor PID for the entire drain; it is removed only when the supervisor process exits.
- The live-lock rejection path runs before any logger emit or state-mutating step, so the rejected run produces zero `log.jsonl` writes.
- The rejection exit code is a dedicated, documented value distinct from the generic failure exit (`1`) and from other engine halt exits, so callers/scripts can detect "already running" specifically.
- Stale-lock reclaim is preserved: a lockfile whose PID is dead (`kill(pid, 0)` ⇒ `ESRCH`) is overwritten and the new run proceeds.
- The `releaseLock` PID-match guard is preserved: the lockfile is deleted only when its contents equal the running process's own PID.
- If the root cause is a cwd/path-resolution mismatch, the lock path must resolve to the same canonical filesystem location regardless of the session's mount view (e.g. `/mnt/c/...`), so two runs always coordinate on one lockfile.
- **Failure behavior**: An unreadable-but-present lockfile or a `kill` probe error other than `ESRCH`/`EPERM` must surface (the acquire path throws/exits rather than silently overwriting a possibly-live lock) — a failed liveness check is never coerced into "stale, reclaim it." A lockfile write failure at acquire time fails the run loudly rather than proceeding lockless. `releaseLock` remains idempotent (missing file ⇒ no-op) and must never throw out of the exit handler. The rejected concurrent run must never delete or truncate the live owner's lockfile under any error path.

## Acceptance Criteria
- [ ] While a `cycle run` is active, `.cycle/engine.lock` exists on disk and contains the live supervisor's PID for the full run (observable: the file is present and its PID matches the supervisor throughout the drain, not just momentarily at start).
- [ ] A second `cycle run` on the same repo while one is live exits cleanly with `engine already running, pid X` on stderr and a dedicated exit code, and the shared `log.jsonl` gains **no** new lines from the rejected run (no `engine.start`, preflight, triage, `engine.halted`, or `engine.stop`).
- [ ] A stale lock (lockfile present, PID dead) is reclaimed and the new run proceeds to `engine.start`.
- [ ] `releaseLock` removes only the lock the running supervisor owns: after a rejected concurrent run exits, the live engine's lockfile is unchanged and still holds the owner's PID (failure-path criterion — the rejected run never deletes the owner's lock, and a non-`ESRCH`/`EPERM` liveness-probe error does not cause a live lock to be overwritten).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node built-in test runner (`node:test`), consistent with the existing `tests/engine/` suite; unit tests in `tests/engine/engine-lock.test.ts` driving `acquireLock`/`releaseLock` with the injectable `LockDeps` (stub `kill`, `readFileSync`, `writeFileSync`, `unlinkSync`).
- Key scenarios:
  - **Happy path / single run**: lock written with own PID; `releaseLock` removes it; idempotent second `releaseLock` is a no-op.
  - **Live-lock rejection**: `kill(pid, 0)` succeeds ⇒ `acquireLock` throws `engine already running, pid X`; assert the rejection happens before any emit (CLI-level test confirming the exit/exit-code occurs with zero `log.jsonl` writes — assert log byte length unchanged).
  - **Stale-lock reclaim**: `kill` ⇒ `ESRCH` ⇒ lockfile overwritten with new PID, run proceeds.
  - **Failure paths**: `EPERM` from `kill` ⇒ treated as live (rejected); a non-`ESRCH`/non-`EPERM` `kill` error ⇒ surfaced (not silently reclaimed); a rejected run never reaches `unlinkSync` on a lock whose PID is not its own (assert `releaseLock` with mismatched PID does not call `unlinkSync`).
  - **Lifetime regression**: a CLI/integration-level assertion that the lockfile is present across the run and removed only on supervisor exit.
- Cardinality-pin any exactly-once engine-event assertions with `filter(...).length === 1`, per repo test conventions.
- No UI changes — no E2E tests required.

## Documentation Updates
- **CLAUDE.md**: Update the `src/engine/engine-lock.ts` architecture note and the lock-related entry to state the corrected lifetime guarantee (held on disk for the full run) and the rejection-before-`engine.start`/preflight/triage ordering, plus the dedicated rejection exit code.
- **docs/ENGINE.md**: Reconcile the engine-lock / supervisor-startup description with the corrected lifetime and ordering (lock acquire → reject-if-live → only then `engine.start`/preflight/triage), and document the dedicated exit code.
- **README.md**: Surface the user-facing behavior if exit codes are documented there — a concurrent `cycle run` is rejected with `engine already running, pid X` and a specific exit code.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/engine-lock.ts` (`acquireLock` / `releaseLock` with injectable `LockDeps`) and `src/cli.ts` (lock acquire/release at ~206–213 and its ordering relative to `engine.start`, preflight, triage, and the residue check) already exist.
- No new external services or env vars. Single-host filesystem PID lockfile at `.cycle/engine.lock` remains the mechanism.
