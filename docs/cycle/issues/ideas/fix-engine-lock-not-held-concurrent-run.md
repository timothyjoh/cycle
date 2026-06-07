---
id: fix-engine-lock-not-held-concurrent-run
source: manual
title: "Engine lock not held for run lifetime; concurrent cycle run residue-halts instead of clean 'already running'"
added_at: 2026-06-07T00:40:00Z
priority: high
---

## Problem

Starting a second `cycle run` on a repo that already has a live engine does **not** get cleanly rejected. Instead the second invocation proceeds through `engine.start → preflight → triage` and then **residue-halts** (`engine.halted { reason: "failed_cycle_dirty_worktree" }`) because it sees the first engine's in-flight dirty tree. Two engines can run against the same repo, both committing to the same branch — a state-corruption risk in trunk mode.

Observed: the cycle repo had a live engine (supervisor pid 2433491, mid-cycle 0263 `fix`). A second `cycle run` was launched from another session; it slipped past the lock and residue-halted at 00:27, polluting `log.jsonl` with a misleading `engine.stop halted` as the last line (engine looked dead while 0263 was in fact still running).

## Already shipped — the lock exists but isn't effective

- `src/engine/engine-lock.ts` — `acquireLock(lockPath)` reads `.cycle/engine.lock`; if it holds a **live** pid (`kill(pid, 0)` succeeds) it throws `engine already running, pid X`; a dead pid is treated as a stale lock and overwritten. `releaseLock(lockPath)` deletes the file only when its content equals the caller's own pid.
- `src/cli.ts:194–201` — `const lockPath = join(cwd, ".cycle", "engine.lock")`, `acquireLock(lockPath)`, and `process.on("exit", () => releaseLock(lockPath))`. Gated to the `run` command (so `status` / `triage --dry-run` / `run-one` do not acquire it).

**Symptom proving it isn't holding:** there was **no `.cycle/engine.lock` file on disk** while the supervisor (pid 2433491) was running, and the concurrent `run` did not receive `engine already running` — it ran preflight/triage and residue-halted instead. So the lock is either not held for the run's full lifetime or is being cleared mid-run.

## Suspected root causes (investigate)

- The `process.on("exit")` `releaseLock` (or an equivalent path) firing from a short-lived invocation and deleting/clearing the lock, or an overlapping stray `run` clearing it on its own exit.
- The lock not surviving across the supervisor's lifetime (e.g. acquired then lost between cycles).
- A path/cwd-resolution mismatch when launched "from somewhere else" (different mount/session view → a different `.cycle/engine.lock` path), so the two runs never coordinate on the same file.

## Scope

1. **Hold the lock for the entire `run` lifetime** — created at supervisor start, present on disk for the whole drain, removed only when the supervisor itself exits.
2. **Reject a concurrent `run` cleanly and early** — when a live lock is present, the second `run` exits with the `engine already running, pid X` message (clear stderr + distinct exit code) **before** `engine.start` / preflight / triage / the residue check ever run, so it never appears as a residue-halt and never writes misleading terminal events into the shared log.
3. **Diagnose and fix why the lockfile is absent mid-run** (per the suspected causes above), and confirm a stale lock (dead pid) is still correctly reclaimed.

## Acceptance criteria

- [ ] While a `cycle run` is active, `.cycle/engine.lock` exists on disk and contains the supervisor's live pid for the full run.
- [ ] A second `cycle run` on the same repo while one is live exits cleanly with `engine already running, pid X` (stderr + dedicated exit code) and emits **no** `engine.start`, preflight, triage, `engine.halted`, or `engine.stop` events — the shared `log.jsonl` is untouched by the rejected run.
- [ ] A stale lock (lockfile present, pid dead) is reclaimed and the new run proceeds (existing behavior preserved).
- [ ] `releaseLock` only removes the lock the running supervisor owns (pid-match guard preserved); a rejected concurrent run never deletes the live engine's lock.
- [ ] Tests: live-lock → second run rejected pre-preflight with no log writes; stale-lock → reclaimed; normal single run → lock present during, removed after; rejected run does not delete the owner's lock.
- [ ] Reconcile docs (CLAUDE.md `engine-lock.ts` note + docs/ENGINE.md) with the corrected lifetime/ordering guarantees.

## Out of scope

- Cross-machine / distributed locking — single-host pid lockfile is the contract.
- The resume-teardown-on-restart fix (separate issue `fix-resume-teardown-before-residue-halt`); the two compound here but are distinct. With the lock fixed, a concurrent run never reaches the residue check at all.

Relevant files: `src/engine/engine-lock.ts`, `src/cli.ts` (lock acquire/release ~194–201 and its ordering vs `engine.start`/preflight/triage/residue).
