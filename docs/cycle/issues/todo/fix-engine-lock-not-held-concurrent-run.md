---
id: fix-engine-lock-not-held-concurrent-run
title: Hold engine lock for full run lifetime; reject concurrent run cleanly
  before preflight
workflow: feature
depends_on: []
triaged_at: 2026-06-07T01:38:43.781Z
source: triage
priority: high
---
## Problem

Starting a second `cycle run` on a repo that already has a live engine is not cleanly rejected. The second invocation proceeds through `engine.start → preflight → triage` and then residue-halts (`engine.halted { reason: "failed_cycle_dirty_worktree" }`) because it observes the first engine's in-flight dirty tree. Two engines can run against the same repo, both committing to the same branch — a state-corruption risk in trunk mode.

Observed: the cycle repo had a live engine (supervisor pid 2433491, mid-cycle 0263 `fix`). A second `cycle run` launched from another session slipped past the lock and residue-halted at 00:27, writing a misleading `engine.stop halted` as the last line of `log.jsonl` (engine looked dead while 0263 was still running).

## Already shipped — the lock exists but isn't effective

- `src/engine/engine-lock.ts` — `acquireLock(lockPath)` reads `.cycle/engine.lock`; if it holds a **live** pid (`kill(pid, 0)` succeeds) it throws `engine already running, pid X`; a dead pid is treated as a stale lock and overwritten. `releaseLock(lockPath)` deletes the file only when its content equals the caller's own pid.
- `src/cli.ts:194–201` — builds `lockPath = join(cwd, ".cycle", "engine.lock")`, calls `acquireLock(lockPath)`, registers `process.on("exit", () => releaseLock(lockPath))`. Gated to the `run` command (so `status` / `triage --dry-run` / `run-one` do not acquire it).

**Symptom proving it isn't holding:** there was **no `.cycle/engine.lock` file on disk** while the supervisor (pid 2433491) ran, and the concurrent `run` did not receive `engine already running` — it ran preflight/triage and residue-halted instead. So the lock is either not held for the run's full lifetime or is being cleared mid-run.

## Investigate root cause (must be diagnosed, not just patched)

Confirm which of these is true and fix it:

- The `process.on("exit")` `releaseLock` (or an equivalent teardown path) firing from a short-lived or overlapping invocation and deleting/clearing the lock.
- The lock not surviving across the supervisor's lifetime (acquired then lost between cycles, or overwritten by a stale-reclaim path).
- A path/cwd-resolution mismatch when launched from a different mount/session view (e.g. `/mnt/c/...` vs a different resolution) → the two runs coordinate on different `.cycle/engine.lock` paths and never see each other.

## Scope

1. **Hold the lock for the entire `run` lifetime** — created at supervisor start, present on disk for the whole drain, removed only when the supervisor itself exits.
2. **Reject a concurrent `run` cleanly and early** — when a live lock is present, the second `run` exits with the `engine already running, pid X` message (clear stderr + distinct, dedicated exit code) **before** `engine.start` / preflight / triage / the residue check ever run, so it never appears as a residue-halt and never writes misleading terminal events into the shared `log.jsonl`.
3. **Confirm a stale lock (dead pid) is still correctly reclaimed** and the new run proceeds (preserve existing behavior).
4. **Preserve the `releaseLock` pid-match guard** — a rejected concurrent run must never delete the live engine's lock.

## Acceptance criteria

- While a `cycle run` is active, `.cycle/engine.lock` exists on disk and contains the supervisor's live pid for the full run.
- A second `cycle run` on the same repo while one is live exits cleanly with `engine already running, pid X` (stderr + dedicated exit code) and emits **no** `engine.start`, preflight, triage, `engine.halted`, or `engine.stop` events — the shared `log.jsonl` is untouched by the rejected run.
- A stale lock (lockfile present, pid dead) is reclaimed and the new run proceeds.
- `releaseLock` only removes the lock the running supervisor owns (pid-match guard preserved); a rejected concurrent run never deletes the live engine's lock.
- Tests cover: live-lock → second run rejected pre-preflight with no log writes; stale-lock → reclaimed; normal single run → lock present during, removed after; rejected run does not delete the owner's lock.
- Docs reconciled with the corrected lifetime/ordering guarantees — CLAUDE.md `engine-lock.ts` note and docs/ENGINE.md.

## Out of scope

- Cross-machine / distributed locking — single-host pid lockfile is the contract.
- The resume-teardown-on-restart fix (separate issue `fix-resume-teardown-before-residue-halt`); the two compound here but are distinct. With the lock fixed, a concurrent run never reaches the residue check.

Relevant files: `src/engine/engine-lock.ts`, `src/cli.ts` (lock acquire/release ~194–201 and its ordering vs `engine.start` / preflight / triage / residue).
