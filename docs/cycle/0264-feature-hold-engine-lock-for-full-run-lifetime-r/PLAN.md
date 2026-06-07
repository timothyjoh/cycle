# Implementation Plan: Cycle 0264

## Overview
Make the engine PID lockfile (`.cycle/engine.lock`) effective for its stated contract: canonicalize the lock path so concurrent runs always coordinate on one physical file, route the live-lock rejection to a dedicated exit code via a typed error (without masking genuine probe/write failures), and prove the lock is held for the full run lifetime and that a rejected run writes nothing to `log.jsonl`.

## Current State (from Research)
- `acquireLock`/`releaseLock` live in `src/engine/engine-lock.ts` with an injectable `LockDeps` (`readFileSync`/`writeFileSync`/`unlinkSync`/`kill`). `acquireLock` reads the lock, probes liveness with `kill(pid, 0)`, throws `engine already running, pid X` when live (or `EPERM`), reclaims on `ESRCH`, re-throws any other probe error, re-throws a non-`ENOENT` read error, and writes its own PID. `releaseLock` deletes only when the file's PID matches `process.pid` and swallows all errors (idempotent).
- The supervisor wires the lock in `src/cli.ts:206–215`: `lockPath = join(cwd, ".cycle", "engine.lock")` with `cwd = process.cwd()`; `acquireLock` in a `try/catch` that prints `.message` and calls **`process.exit(1)`** (generic code, no dedicated value); release via `process.on("exit", () => releaseLock(lockPath))`. The acquire happens before `createLogger` (`src/cli.ts:217`), `engine.start` (`:245`), preflight (`:290`), the startup residue re-check (`:329`), and triage (`:347`), so a rejection at acquire writes nothing to `log.jsonl`.
- The child `run-one` never touches the lock (it returns at `src/cli.ts:99`, before `:206`). The only `releaseLock` caller is the supervisor's `exit` handler. Teardown (`failed-cycle-teardown.ts`) acts only on `git status --porcelain` paths; `.cycle/engine.lock` is git-ignored so it never appears there and is never `rmSync`'d.
- `engine-lock.ts` is pinned at **100% line / 100% function** coverage. Unit tests in `tests/engine/engine-lock.test.ts`; integration tests in `tests/cli/engine-lock-integration.test.ts` spawn real `dist/cycle.js`. The live-lock integration test asserts only `notEqual(status, 0)` — no dedicated code, no log-untouched assertion — and pre-writes the lock at `join(root, ".cycle", "engine.lock")` (un-canonicalized).
- Dedicated exit codes already exist by convention: `run-one` 0/1/2/3, SIGINT 130, SIGTERM 143, supervisor `process.exit(halted ? 1 : 0)`. No code is reserved for the lock rejection. README has no exit-code table; docs/ENGINE.md "Single-engine lock" section currently says only "exits non-zero."

## Desired End State
- `lockPath` is built from `realpathSync(cwd)`, so two sessions reaching the same repo through different mount/symlink views resolve the same physical lockfile.
- `acquireLock` throws a typed error (`.code === "ENGINE_ALREADY_RUNNING"`) for the live/`EPERM` case and ordinary errors for unreadable-lock / non-`ESRCH`-`EPERM` probe / write failures. The CLI catch maps `ENGINE_ALREADY_RUNNING` → the dedicated exit code `LOCK_HELD_EXIT_CODE = 75` and everything else → `1`.
- A concurrent `cycle run` exits **75** with `engine already running, pid X` on stderr and adds **zero** bytes to `log.jsonl`; the live owner's lockfile is unchanged.
- Stale-lock reclaim, the `releaseLock` PID-match guard, and fail-loud probe/read/write behavior are preserved and now have unit + integration coverage, including a lifetime regression test proving the lock is present throughout the drain and removed only on supervisor exit.
- Verify with: `npm test`, `npm run typecheck`, `npm run test:coverage` (100% floor on `engine-lock.ts` held), and inspection of the new integration assertions.

## What We're NOT Doing
- Cross-machine / distributed locking — the single-host PID lockfile remains the only mechanism.
- The resume-teardown-on-restart fix (`fix-resume-teardown-before-residue-halt`) — separate issue.
- Any change to the residue guard's behavior, to `run-one`'s exit codes, or to signal-handler codes (130/143).
- Emitting any structured `log.jsonl` event from the lock path — the rejection deliberately precedes the logger and must stay silent in the log.
- Heartbeat re-assertion of the lock during the drain or a lock daemon — out of scope; the existing acquire-once / release-on-exit model is preserved.

## Implementation Approach
**Root-cause finding (diagnosis, per SPEC).** Code inspection rules out two of the three hypotheses: (a) *overlapping teardown firing `releaseLock`* — the only `releaseLock` caller is the supervisor's own PID-match-guarded `exit` handler; the child `run-one` never registers it, and `failed-cycle-teardown.ts` only `rmSync`s `git status --porcelain` paths, which never include the git-ignored `engine.lock`; (b) *lock not surviving the run* — `acquireLock` writes the file at start and nothing between acquire and drain deletes it; the file is removed only on the supervisor's own exit. That leaves **(c) a cwd/path-resolution mismatch**: `lockPath` is built from the raw `process.cwd()` string, so two sessions reaching the repo through different views (a symlinked path vs the real path) compute divergent `lockPath` values and write/check different files — exactly consistent with the observed "no `.cycle/engine.lock` on disk while the supervisor ran, second run not rejected." The fix canonicalizes the path with `realpathSync`, and a new lifetime regression test guards against any future survival regression.

The change is small and surgical: (1) a clean, typed-error refactor of `acquireLock` that preserves every existing branch and adds a `.code`; (2) `realpathSync` canonicalization + dedicated-exit-code routing in `cli.ts`; (3) new unit + integration tests including the lifetime and log-untouched assertions; (4) docs. Vertical slices each land code + tests together.

## Failure & Resilience Decisions

**Task 1 — `engine-lock.ts` refactor (FS reads/writes + `kill` probe)**
- **Failure modes**: unreadable-but-present lockfile (read error ≠ `ENOENT`) → **propagate** (the acquire throws; never silently overwrite a possibly-live lock). `kill` probe error `ESRCH` → reclaim (stale); `EPERM` → treat as live, throw typed `ENGINE_ALREADY_RUNNING`; any other probe error → **propagate** (never coerced to "stale"). `writeFileSync` failure at acquire → **propagate** (run fails loudly, never proceeds lockless). Live lock → throw typed `ENGINE_ALREADY_RUNNING`. In `releaseLock`: missing file or any error → **swallow** (idempotent; must never throw out of the `exit` handler) but delete **only** on PID match.
- **Idempotency**: `acquireLock` is the exclusion primitive; a stale (dead-PID) or `ENOENT` lock is safely overwritten; a malformed (NaN) PID falls through to overwrite (preserves current behavior). `releaseLock` is idempotent and PID-guarded — a non-owner never deletes the lock, so a rejected concurrent run cannot remove the owner's file under any path. Re-running `acquireLock` after a real crash succeeds (dead PID reclaimed).
- **Observability**: the live-lock throw carries `engine already running, pid X` (surfaced by the CLI to stderr) plus the `.code` discriminator; genuine read/probe/write errors carry their native message/`code` and surface to the CLI catch → exit 1. No swallowed acquire-path error.
- **No silent failure**: the only swallow is `releaseLock`'s by-design idempotent catch (documented, never throws); every acquire-path error surfaces to the caller.

**Task 2 — `cli.ts` canonicalization + exit-code routing (FS realpath + process exit)**
- **Failure modes**: `realpathSync(cwd)` cannot fail for a live `cwd` (the process is running in it); an initialized repo always has `.cycle/` (required by `run` today, before `createLogger`). `acquireLock` throw of `ENGINE_ALREADY_RUNNING` → stderr message + `process.exit(75)`; any other throw → stderr message + `process.exit(1)`.
- **Idempotency**: pure routing of a single acquire attempt; no retry, no state mutation before the logger. Re-invocation after a real exit reclaims a stale lock via Task 1.
- **Observability**: the rejection prints `engine already running, pid X` to stderr and exits 75; a genuine failure prints its message and exits 1. The rejection happens **before** `createLogger`/`engine.start`, so `log.jsonl` is provably untouched.
- **No silent failure**: both branches print to stderr and exit non-zero; nothing is swallowed.

**Task 3 — tests**: N/A — test code (real FS temp dirs and stubbed `LockDeps`; no production failure surface).

**Task 4 — docs**: N/A — documentation only.

---

## Task 1: Typed `ENGINE_ALREADY_RUNNING` error + dedicated exit-code constant in `engine-lock.ts`

### Overview
Restructure `acquireLock` so the live-lock rejection throws a typed error distinguishable from genuine read/probe/write failures, export the discriminator code and the dedicated exit code, and preserve every existing branch byte-for-behavior.

### Changes Required
**File**: `src/engine/engine-lock.ts`
**Changes**:
- Export the constants:
  ```ts
  export const ALREADY_RUNNING_CODE = "ENGINE_ALREADY_RUNNING";
  // EX_TEMPFAIL (sysexits): "temporary failure; a retry may succeed" — fits "engine
  // already running, try again later." Distinct from 1 (generic), 2/3 (run-one),
  // 130 (SIGINT), 143 (SIGTERM).
  export const LOCK_HELD_EXIT_CODE = 75;
  ```
- Add a factory that tags the error:
  ```ts
  function alreadyRunning(pid: number): NodeJS.ErrnoException {
    const e = new Error(`engine already running, pid ${pid}`) as NodeJS.ErrnoException;
    e.code = ALREADY_RUNNING_CODE;
    return e;
  }
  ```
- Restructure `acquireLock` so the live-lock throw is no longer caught-and-rethrown by the probe `catch` (clearer than today's control flow), while keeping all branches:
  ```ts
  export function acquireLock(lockPath: string, deps: LockDeps = defaultDeps): void {
    let raw: string | undefined;
    try {
      raw = deps.readFileSync(lockPath, "utf8").trim();
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw e; // unreadable-but-present lock surfaces
      raw = undefined;                     // no lock yet — proceed to write
    }
    if (raw !== undefined) {
      const pid = parseInt(raw, 10);
      if (!Number.isNaN(pid)) {
        let live = false;
        try {
          deps.kill(pid, 0);
          live = true;                     // no throw ⇒ process exists
        } catch (e) {
          const err = e as NodeJS.ErrnoException;
          if (err.code === "ESRCH") {
            // stale — fall through and overwrite
          } else if (err.code === "EPERM") {
            live = true;                   // exists but not ours
          } else {
            throw e;                       // failed probe surfaces, never "stale"
          }
        }
        if (live) throw alreadyRunning(pid);
      }
      // NaN pid ⇒ malformed lock; preserve current behavior (overwrite)
    }
    deps.writeFileSync(lockPath, String(process.pid), "utf8"); // write failure propagates
  }
  ```
- `releaseLock` unchanged (PID-match guard + idempotent swallow).

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean (no warnings).
- [ ] Live lock and `EPERM` throw an error whose `.code === ALREADY_RUNNING_CODE` and message `engine already running, pid X`.
- [ ] `ESRCH` reclaims (writes own PID); `ENOENT` writes own PID.
- [ ] Unreadable-but-present lock (read error ≠ `ENOENT`), non-`ESRCH`/`EPERM` probe error, and `writeFileSync` failure each **propagate** (no swallow, no overwrite of a possibly-live lock).
- [ ] `releaseLock` deletes only on PID match; missing-file/error is a no-op and never throws.
- [ ] 100% line / 100% function coverage on `engine-lock.ts` retained (new branches covered by Task 3 unit tests).

---

## Task 2: Canonicalize lock path and route the dedicated exit code in `cli.ts`

### Overview
Resolve `lockPath` from the canonical filesystem location so divergent mount/symlink views coordinate on one lockfile, and map the typed rejection to exit `75` while keeping genuine acquire failures on exit `1`.

### Changes Required
**File**: `src/cli.ts`
**Changes**:
- Extend the `node:fs` import (line 1) to include `realpathSync`:
  ```ts
  import { appendFileSync, realpathSync } from "node:fs";
  ```
- Import the new constants from the lock module (line 42):
  ```ts
  import { acquireLock, releaseLock, ALREADY_RUNNING_CODE, LOCK_HELD_EXIT_CODE } from "./engine/engine-lock.ts";
  ```
- Canonicalize the lock path (line 206) and route the catch (lines 207–212):
  ```ts
  const lockPath = join(realpathSync(cwd), ".cycle", "engine.lock");
  try {
    acquireLock(lockPath);
  } catch (err) {
    console.error((err as Error).message);
    const code = (err as NodeJS.ErrnoException).code === ALREADY_RUNNING_CODE
      ? LOCK_HELD_EXIT_CODE
      : 1;
    process.exit(code);
  }
  ```
- Leave `process.on("exit", () => releaseLock(lockPath))` and the SIGINT/SIGTERM handlers (lines 213–215) unchanged — they now reference the canonical `lockPath`, so acquire and release agree.
- Note: only the lockfile's path string changes; `cwd` elsewhere in `cli.ts` is left untouched to avoid unrelated behavior changes. The rejection still precedes `createLogger`/`engine.start`, preserving the "no log writes from a rejected run" guarantee.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] A concurrent run against a live lock exits `75` with `engine already running, pid X` on stderr.
- [ ] A genuine acquire failure (write/probe error) still exits `1`.
- [ ] `lockPath` resolves through symlinks (verified by the integration test under a symlinked temp dir).
- [ ] No `log.jsonl` line is written on the rejection path.

---

## Task 3: Unit + integration tests (new branches, dedicated code, log-untouched, lifetime)

### Overview
Cover the new typed-error branches at the unit level and add integration assertions for the dedicated exit code, the log-untouched guarantee, and the full-run lock lifetime — all with real implementations per the anti-mock convention.

### Changes Required
**File**: `tests/engine/engine-lock.test.ts`
**Changes** (drive `acquireLock`/`releaseLock` with stubbed `LockDeps`):
- Live lock: `kill` returns ⇒ throws with `.code === ALREADY_RUNNING_CODE` and message `engine already running, pid 12345` (extend existing case to assert `.code`).
- `EPERM`: throws with `.code === ALREADY_RUNNING_CODE`.
- **New** — unreadable-but-present lock: `readFileSync` throws `{ code: "EACCES" }` ⇒ `acquireLock` rethrows it, and `writeFileSync` is **not** called (assert via a stub that records calls).
- **New** — non-`ESRCH`/`EPERM` probe error: `kill` throws `{ code: "EINVAL" }` ⇒ rethrown; `writeFileSync` not called.
- **New** — write failure: `writeFileSync` throws ⇒ `acquireLock` propagates.
- `ESRCH` reclaim and `ENOENT` write paths still pass (assert `writeFileSync` called with own PID).
- `releaseLock`: own PID ⇒ `unlinkSync` called; other PID ⇒ `unlinkSync` **not** called; absent file ⇒ no throw.
- Assert `LOCK_HELD_EXIT_CODE === 75` (lock the contract).

**File**: `tests/cli/engine-lock-integration.test.ts`
**Changes** (spawn real `dist/cycle.js`):
- Canonicalize the expected lock path in every case so symlinked temp dirs (e.g. macOS `/tmp`) match the supervisor's `realpathSync`:
  ```ts
  const lockPath = join(realpathSync(root), ".cycle", "engine.lock");
  ```
- **Live-lock case** (extend existing): pre-write the lock at the canonical `lockPath` with `process.pid`; assert `result.status === 75` (dedicated code, not just non-zero), stderr includes `engine already running, pid ${process.pid}`, the lockfile still holds `process.pid`, **and** `log.jsonl` is byte-unchanged (capture `statSync(logPath).size` — or absence — before/after the rejected run; assert no `engine.start`/`engine.halted`/`engine.stop` lines were appended).
- Stale-lock case (existing): keep — reclaims, exits `0`, lock absent after exit; verify it uses the canonical path.
- **New — lifetime regression**: start a real `cycle run` with a workflow whose bash step blocks briefly (e.g. a `sleep`-based verify script under the test repo) using the existing async-spawn + `waitForLock`/`waitForLogEvent` helpers; while the run is mid-drain assert `existsSync(lockPath)` and that the file content equals the spawned supervisor's PID; then let it finish (or signal it) and assert the lock is removed only after exit (`waitForAbsence`). Cardinality-pin any exactly-once event assertions with `filter(...).length === 1`.

### Success Criteria
- [ ] `npm test` passes (all existing + new tests).
- [ ] `npm run test:coverage` keeps `engine-lock.ts` at 100% line / 100% function.
- [ ] Integration test asserts exit code exactly `75` and `log.jsonl` byte-unchanged on rejection.
- [ ] Lifetime test proves the lock is present (and PID-correct) during the drain and absent after exit.
- [ ] Failure-path unit tests (unreadable lock, non-`ESRCH`/`EPERM` probe, write failure) confirm errors surface and no spurious overwrite occurs.

---

## Task 4: Documentation updates

### Overview
Reconcile the lock docs with the corrected lifetime guarantee, the rejection-before-`engine.start`/preflight/triage ordering, the canonical-path coordination, and the dedicated exit code.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: Update the `src/engine/engine-lock.ts` architecture note and the lock-related entry to state: lock held on disk for the supervisor's full run lifetime (written at start, removed only on the supervisor's own PID-guarded exit; child `run-one` never touches it); the live-lock rejection fires **before** `createLogger`/`engine.start`/preflight/triage (zero `log.jsonl` writes) and exits with the dedicated `LOCK_HELD_EXIT_CODE = 75` via the typed `ENGINE_ALREADY_RUNNING` error (genuine read/probe/write failures still exit `1`); the lock path is canonicalized with `realpathSync(cwd)` so divergent mount/symlink views coordinate on one file.

**File**: `docs/ENGINE.md`
**Changes**: Rewrite the "Single-engine lock" section to describe acquire → reject-if-live (exit 75, stderr `engine already running, pid X`, no log writes) → only then `engine.start`/preflight/triage; the canonical `realpathSync` path; stale-lock reclaim; the `releaseLock` PID-match guard; and the fail-loud behavior for unreadable lock / non-`ESRCH`-`EPERM` probe / write failure. Document the dedicated exit code `75` alongside the existing `run-one` 2/3 and signal 130/143 codes.

**File**: `README.md`
**Changes**: Add one sentence near the `cycle run` / failure-handling description: a second `cycle run` on a repo that already has a live engine is rejected immediately with `engine already running, pid X` on stderr and exit code `75`, leaving the running engine's log untouched.

### Success Criteria
- [ ] CLAUDE.md, docs/ENGINE.md, and README.md describe the corrected lifetime, ordering, canonical path, and exit code `75`.
- [ ] No stale "exits non-zero" wording remains where the dedicated code now applies.
- [ ] Docs match the implemented behavior (cross-checked against Tasks 1–2).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] While a `cycle run` is active, `.cycle/engine.lock` exists on disk and contains the live supervisor's PID for the full run (observable: the file is present and its PID matches the supervisor throughout the drain, not just momentarily at start). | Task 3 | Lifetime regression integration test; canonical path from Task 2 ensures it's the right file. |
| [ ] A second `cycle run` on the same repo while one is live exits cleanly with `engine already running, pid X` on stderr and a dedicated exit code, and the shared `log.jsonl` gains **no** new lines from the rejected run (no `engine.start`, preflight, triage, `engine.halted`, or `engine.stop`). | Task 1, Task 2, Task 3 | Typed error + exit 75 routing; integration test asserts code 75, stderr message, and log byte-unchanged. |
| [ ] A stale lock (lockfile present, PID dead) is reclaimed and the new run proceeds to `engine.start`. | Task 1, Task 3 | `ESRCH` reclaim branch preserved; existing stale-lock integration test (canonical path). |
| [ ] `releaseLock` removes only the lock the running supervisor owns: after a rejected concurrent run exits, the live engine's lockfile is unchanged and still holds the owner's PID (failure-path criterion — the rejected run never deletes the owner's lock, and a non-`ESRCH`/`EPERM` liveness-probe error does not cause a live lock to be overwritten). | Task 1, Task 3 | PID-match guard preserved; new unit tests for mismatched-PID no-unlink and non-`ESRCH`/`EPERM` probe surfacing; integration asserts owner lock unchanged. |
| [ ] All existing tests still pass. | Task 1, Task 2, Task 3 | `npm test`; integration helpers updated for canonical path so pre-existing cases keep passing. |
| [ ] No compiler/linter warnings introduced. | Task 1, Task 2 | `npm run typecheck` clean; typed-error uses `NodeJS.ErrnoException`. |

---

## Testing Strategy

### Unit Tests
- `tests/engine/engine-lock.test.ts` drives `acquireLock`/`releaseLock` with stubbed `LockDeps` (real call-recording stubs, not heavy mocks):
  - Happy path: `ENOENT` ⇒ writes own PID; `releaseLock` own PID ⇒ deletes; second `releaseLock` (absent file) ⇒ no-op, no throw.
  - Live lock (`kill` returns) and `EPERM` ⇒ throw with `.code === ALREADY_RUNNING_CODE`, message `engine already running, pid X`.
  - **Failure paths**: unreadable-but-present lock (read throws `EACCES`) ⇒ rethrow, `writeFileSync` not called; non-`ESRCH`/`EPERM` probe error (`kill` throws `EINVAL`) ⇒ rethrow, no overwrite; `writeFileSync` throws ⇒ propagate.
  - `ESRCH` ⇒ reclaim/overwrite with own PID; mismatched PID in `releaseLock` ⇒ `unlinkSync` not called.
  - Contract: `LOCK_HELD_EXIT_CODE === 75`.
- Mocking strategy: inject `LockDeps` (the existing seam) — no `node:fs` module stubbing needed, consistent with current tests and the "real implementations over mocking" bias.

### Integration / E2E Tests
- `tests/cli/engine-lock-integration.test.ts` spawns real `dist/cycle.js` against an `mkdtemp` git repo (`--skip-preflight`):
  - Live-lock rejection: pre-write canonical lock with `process.pid` ⇒ exit `75`, stderr message, owner lock unchanged, `log.jsonl` byte-unchanged (no new `engine.*`/preflight/triage lines).
  - Stale-lock reclaim: dead PID ⇒ exit `0`, lock absent after exit.
  - Lifetime regression: long-running bash step ⇒ lock present and PID-correct mid-drain (via `waitForLock`/`waitForLogEvent`), removed only after supervisor exit (`waitForAbsence`).
  - Symlinked-temp-dir robustness: expected lock path computed via `realpathSync(root)` so canonicalization is exercised on systems where `tmpdir()` is a symlink.
  - Existing SIGINT/SIGTERM cleanup cases retained, cardinality-pinned.
- No UI changes — no browser/E2E tests required.

## Risk Assessment
- **`realpathSync` breaks existing integration tests on symlinked temp dirs**: mitigated by updating every integration case to compute the expected `lockPath` via `realpathSync(root)`; verified by `npm test` on this machine and the symlinked-dir assertion.
- **`realpathSync(cwd)` throws if `.cycle` parent is unusual**: `cwd` is the live process directory and always resolvable; `.cycle/` already must exist for `run` before the logger mkdir, so no new precondition is introduced. If `realpathSync` ever threw, it would surface as a loud non-zero exit (no swallow), which is acceptable fail-loud behavior.
- **Coverage floor (100%) on new branches**: mitigated by the dedicated unit cases for unreadable-lock, non-`ESRCH`/`EPERM` probe, and write-failure paths; `npm run test:coverage` gates it before commit.
- **Exit-code collision (75)**: checked against all existing codes (0/1/2/3/130/143 and supervisor `halted ? 1 : 0`); 75 (EX_TEMPFAIL) is unused and semantically apt; locked by a unit assertion so a future change is caught.
- **Root cause is actually (a) or (b), not (c)**: the lifetime regression test plus the typed-error/dedicated-code routing fix the user-visible contract regardless of which hypothesis held; if the build step finds residual evidence for (a)/(b), the BUILD notes must record it, but the canonical-path fix and lifetime test are the durable guard either way.
