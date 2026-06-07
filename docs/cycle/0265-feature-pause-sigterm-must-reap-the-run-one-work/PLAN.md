# Implementation Plan: Cycle 0265

## Overview
Turn a SIGTERM/SIGINT interruption of a running engine into a clean **suspend-and-resume**: the supervisor reaps its `run-one` worker (and the worker reaps its detached agent/bash grandchild) with a bounded SIGTERM→grace→SIGKILL, records the in-flight cycle as **interrupted**, and on the next `cycle run` resumes that cycle from where it stopped with WIP intact — bypassing the `failed_cycle_dirty_worktree` residue halt, which stays byte-for-byte for genuine failures.

## Current State (from Research)
- **Supervisor signal handling** (`src/cli.ts:227–242`): `SIGINT`→`exit(130)`, `SIGTERM`→`exit(143)`, plus a `prependListener("SIGTERM")` that best-effort appends `cycle.killed` then `exit(143)`. None of these touch the spawned worker — the parent dies and the `run-one` child (and its `claude`/bash grandchild) keep running and mutating the repo.
- **`spawnRunOne`** (`src/cli.ts:446–473`): spawns `node <argv[1]> run-one …` with `stdio:"inherit"`, `shell:false`, **not detached**, returning a `Promise<number>`. The child handle is local — nothing module-level tracks it.
- **`run-one`** (`src/cli/run-one.ts:71–98`): **no signal handler**; on SIGTERM it dies by default action, orphaning whatever child `runCycle` has spawned.
- **Agent children** (`src/engine/exec-spawn.ts:29`) are spawned `detached: true` (own process group) so the timeout `killTree` can `process.kill(-child.pid, sig)` the whole tree. They are **not** in `run-one`'s process group, so group-killing the worker would never reach them — the worker must explicitly cascade.
- **Bash steps** (`src/engine/exec-bash.ts:28`) are spawned **not detached** (in `run-one`'s group).
- **Kill-grace pattern** to mirror: `exec-spawn.ts:80–86` (SIGTERM, then SIGKILL after `5_000`ms; `walkthrough.ts` `WALKTHROUGH_KILL_GRACE_MS = 5000`).
- **`log-tail.ts`** (`parseLogTail`/`readLogTail`/`InFlightCycle`): returns `null` when a `cycle.end` follows the last `cycle.start`; otherwise an in-flight descriptor. **No interrupted-vs-failed surface.** Malformed JSON lines are already skipped.
- **Resume-from-tail block** (`src/cli.ts:697–753`): on any in-flight tail it unconditionally arms `pendingResidueContext = { …, failingStep: undefined }` (the **whitelisted** arm, `scripts/structural-invariants.mjs` `WHITELIST = /failingStep:\s*undefined/`), runs `haltIfResidue()` **before** `runResumeOnce` — so an interrupted cycle's WIP is treated as residue and halts.
- **`runResumeOnce`** (`src/cli.ts:475–641`): resumes via `--resume-from-step` (skip-completed); it does **not** teardown before running — teardown only fires *after* a resumed step fails. So "no teardown on the interrupted path" is satisfied by reusing it as-is plus skipping the pre-resume residue halt.

## Desired End State
- Sending SIGTERM/SIGINT to a `cycle run` supervisor terminates the active `run-one` worker **and** its detached agent/bash grandchild within a bounded grace window; `ps`/`kill(pid,0)` shows no survivors. The signal handler never throws (ESRCH ⇒ no-op).
- The interrupted in-flight cycle is recorded via the `cycle.killed` marker; `parseLogTail` surfaces `InFlightCycle.interrupted === true`.
- The next `cycle run` resumes that cycle (skip-completed) with the dirty worktree intact and emits **no** `engine.halted{failed_cycle_dirty_worktree}`.
- A genuine step-failure in-flight tail (no `cycle.killed`) still arms the residue guard and halts exactly as today.
- Verify: `npm test` (new + existing), `npm run typecheck`, and an integration test that signals the real `dist/cycle.js` supervisor and asserts the worker subtree is dead.

## What We're NOT Doing
- No concurrent-`run` rejection / lock-lifetime changes (landed cycle 0264).
- No change to the genuine-failure residue guard, teardown, or `max_consecutive_failures` accounting.
- No richer "WIP may exist" prompt wording for the resumed step (engine-side resume only; prompt reconciliation is a follow-up).
- No removal of agent-child `detached: true` (kept — the worker cascades to it explicitly).
- No new env vars or external services. No UI/E2E changes.

## Implementation Approach
Three concerns, layered so each is independently testable:

1. **Classification (`log-tail.ts`)** — add a pure `interrupted` flag derived from a trailing `cycle.killed` for the in-flight cycle. Fail-closed: anything that isn't an unambiguous `cycle.killed` terminal ⇒ `interrupted: false` ⇒ existing path.
2. **Reaping** — because agent children are detached into their own groups, the worker (`run-one`) cannot be reaped transitively from the supervisor; it must cascade itself. Introduce a tiny **active-child registry** (`src/engine/active-child.ts`) that `exec-spawn`/`exec-bash` register their group-leader PIDs into; `run-one` installs a SIGTERM/SIGINT handler that group-kills every registered child (SIGTERM→grace→SIGKILL) then exits. The supervisor tracks the `run-one` worker handle and forwards SIGTERM→grace→SIGKILL to it. This is the SPEC's PID-forwarding path with the worker's own handler doing the grandchild cascade — no detached-worker fallback needed.
3. **Resume branch (`cli.ts`)** — when `tail.interrupted`, skip arming `pendingResidueContext` and skip `haltIfResidue()`, routing straight to the unchanged `runResumeOnce` (WIP preserved). The non-interrupted path is byte-for-byte unchanged, keeping the whitelisted arm line intact so the arm→persist structural invariant still passes.

## Failure & Resilience Decisions

**Task 1 — `log-tail.ts` classification.** N/A — pure (string parse; malformed lines already skipped; `readLogTail` keeps its existing ENOENT⇒null / rethrow contract). The `interrupted` flag defaults `false`, so a malformed/absent marker degrades to the existing residue-gated path (fail-closed) — never a silent guard bypass.

**Task 2 — active-child registry + `run-one` cascade.**
- *Failure modes*: `process.kill(-pid, sig)` on an already-dead group throws `ESRCH` → caught and ignored (already reaped). `EPERM`/other → caught and ignored inside the handler (a signal handler must never throw or it leaves the worker un-exited). A child that ignores SIGTERM is killed by the SIGKILL backstop after the grace window.
- *Idempotency*: registry uses a `Set<number>`; double-register is a no-op, unregister-after-exit is a no-op. The handler guards re-entrancy (`handling` flag) so a second signal doesn't relaunch the kill sequence. Killing a group twice is harmless (second is ESRCH). Re-runs of a step register a fresh pid and unregister on `close`.
- *Observability*: `run-one`'s handler writes a one-line `run-one: interrupted by <sig>, reaping N child group(s)` to `process.stderr` before exiting (`stdio:"inherit"` ⇒ visible in the supervisor's stream). No swallowed silent exit.
- *No silent failure*: the handler always exits non-zero (143/130); reap errors are diagnosable via the stderr line; the registry never hides a spawn.

**Task 3 — supervisor worker reaping (`cli.ts`).**
- *Failure modes*: `activeWorker.kill('SIGTERM')` on a dead child throws nothing (Node's `ChildProcess.kill` returns `false` and sets no throw for a reaped child). If the worker is already gone (`activeWorker` undefined or `exitCode !== null`), the handler exits immediately. The SIGKILL-after-grace timer is the backstop for a worker ignoring SIGTERM. Marker-append failure is caught (existing best-effort `try/catch`) and still exits.
- *Idempotency*: a `signalHandled` guard makes the handler run once. The grace timer and the worker's `exit` listener race to `process.exit` — whichever fires first wins; the other is harmless (process is exiting).
- *Observability*: existing `cycle.killed` append (extended to be the interrupted marker); `process.exit(143|130)` carries intent.
- *No silent failure*: all reap errors are non-fatal-by-design (the goal is to exit); the worker is guaranteed dead by the SIGKILL backstop or its own handler; no error is swallowed in a way that leaves a survivor.

**Task 4 — resume-path interrupted branch (`cli.ts`).**
- *Failure modes*: `readLogTail` rethrow on a non-ENOENT read error is unchanged (propagates → crashes start, same as today — not a new surface). A tail that can't be classified as interrupted defaults to the existing residue-gated path. `runResumeOnce` failure modes (base-refresh, row-mismatch, step failure) are unchanged.
- *Idempotency*: resume is already idempotent via skip-completed (`--resume-from-step`); re-running re-executes only the interrupted step on top of WIP. No teardown means no destructive re-run.
- *Observability*: emit `engine.resume{…, interrupted: true}` (extend the existing `engine.resume` payload) so the suspend-resume is greppable; the non-interrupted path keeps its existing events.
- *No silent failure*: the interrupted branch only bypasses the guard when `interrupted === true` (fail-closed); a genuine failure tail never reaches the bypass.

**Task 5 — docs.** N/A — pure (Markdown).

---

## Task 1: Surface `interrupted` on `InFlightCycle`

### Overview
Make `parseLogTail` classify an in-flight cycle whose tail ends in a `cycle.killed` marker (after the last `cycle.start`, with no `cycle.end`) as `interrupted`, so the resume path can distinguish a clean signal-suspend from a genuine failure.

### Changes Required
**File**: `src/engine/log-tail.ts`
**Changes**:
- Add `interrupted: boolean` to the `InFlightCycle` type.
- In `parseLogTail`, after confirming no `cycle.end` for `cycleId`, scan the events after `lastStartIdx` for an event `cycle.killed` whose `cycle_id === cycleId` (or `cycle_id` absent — the existing handler may write `undefined`; treat an undefined `cycle_id` on a `cycle.killed` as matching the single in-flight cycle). Set `interrupted = true` when found, else `false`. Include `interrupted` in the returned object.

```ts
let interrupted = false;
for (let i = lastStartIdx + 1; i < events.length; i++) {
  const e = events[i];
  if (e.event === "cycle.killed" && (e.cycle_id === cycleId || e.cycle_id === undefined)) {
    interrupted = true;
    break;
  }
}
// ... return { ..., interrupted };
```

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] `parseLogTail` returns `interrupted: true` for a tail ending in `cycle.killed` for the in-flight cycle.
- [ ] Returns `interrupted: false` for an in-flight tail with a `step.end{status:"failed"}` but no `cycle.killed`.
- [ ] A malformed `cycle.killed` line (bad JSON) is skipped ⇒ `interrupted: false` (fail-closed).
- [ ] Failure paths behave as designed (no throw added; `readLogTail` ENOENT⇒null / rethrow unchanged).

---

## Task 2: Active-child registry + `run-one` signal cascade

### Overview
Give `run-one` the ability to reap its detached agent / bash grandchild on signal. A module-level registry records each spawned child's group-leader PID; `run-one`'s SIGTERM/SIGINT handler group-kills every registered child (SIGTERM→grace→SIGKILL) then exits.

### Changes Required
**File**: `src/engine/active-child.ts` (new)
**Changes**: a tiny registry + reaper.
```ts
const active = new Set<number>();
export function registerActiveChild(pid: number | undefined): void {
  if (typeof pid === "number") active.add(pid);
}
export function unregisterActiveChild(pid: number | undefined): void {
  if (typeof pid === "number") active.delete(pid);
}
export function activeChildCount(): number { return active.size; }
// Group-kill every registered child (negative pid = its process group, since
// children are spawned detached). Swallows ESRCH/EPERM — a reaper must not throw.
export function killActiveChildren(sig: NodeJS.Signals): void {
  for (const pid of active) {
    try { process.kill(-pid, sig); }
    catch { try { process.kill(pid, sig); } catch { /* already gone */ } }
  }
}
export const WORKER_CHILD_KILL_GRACE_MS = 5000; // mirrors WALKTHROUGH_KILL_GRACE_MS
```

**File**: `src/engine/exec-spawn.ts`
**Changes**: after `spawn(...)`, `registerActiveChild(child.pid)`; in the `done(...)` settler (and on `error`), `unregisterActiveChild(child.pid)`. Children are already `detached: true`, so the group-kill in the registry reaches their subtree.

**File**: `src/engine/exec-bash.ts`
**Changes**: spawn the bash child `detached: true` (so the registry's `-pid` group-kill reaps any tool the script forks); `registerActiveChild(child.pid)` after spawn; `unregisterActiveChild` on `close` and `error`. (Detaching a never-unref'd child does not change the wait semantics — the parent still resolves on `close`.)

**File**: `src/cli/run-one.ts`
**Changes**: at the top of `runOne`, before `runCycle`, install once:
```ts
let handlingSignal = false;
function reapAndExit(sig: NodeJS.Signals, code: number) {
  if (handlingSignal) return;
  handlingSignal = true;
  const n = activeChildCount();
  if (n > 0) process.stderr.write(`run-one: interrupted by ${sig}, reaping ${n} child group(s)\n`);
  killActiveChildren("SIGTERM");
  const t = setTimeout(() => { killActiveChildren("SIGKILL"); process.exit(code); }, WORKER_CHILD_KILL_GRACE_MS);
  t.unref?.();
}
process.on("SIGTERM", () => reapAndExit("SIGTERM", 143));
process.on("SIGINT", () => reapAndExit("SIGINT", 130));
```

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Registry add/remove is idempotent (`Set`); `killActiveChildren` on an empty/ESRCH set throws nothing.
- [ ] `exec-spawn` and `exec-bash` register on spawn and unregister on `close`/`error` (no leak across steps).
- [ ] A `run-one` process running a long bash/agent step, sent SIGTERM, kills its child group within the grace window and exits 143.
- [ ] Failure paths behave as designed (ESRCH/EPERM swallowed inside the reaper; handler never throws; stderr line emitted when children were present).

---

## Task 3: Supervisor tracks the worker and reaps it on signal

### Overview
Track the spawned `run-one` worker handle at module scope and rewrite the supervisor's SIGTERM/SIGINT handlers to forward SIGTERM→grace→SIGKILL to it (which triggers the worker's own cascade from Task 2) before the parent exits, replacing the immediate `exit(143)`/`exit(130)` listeners.

### Changes Required
**File**: `src/cli.ts`
**Changes**:
- Add a module-level `let activeWorker: ReturnType<typeof spawn> | undefined;`. In `spawnRunOne`, assign `activeWorker = child;` after `spawn(...)`, and clear it (`activeWorker = undefined`) in both `child.on("close", …)` and `child.on("error", …)` before resolving/rejecting.
- Define `const WORKER_KILL_GRACE_MS = 5000;` (mirrors `WALKTHROUGH_KILL_GRACE_MS`).
- Replace lines 228–242 with unified handlers. A single guarded routine writes the `cycle.killed` interrupted marker (existing best-effort `appendFileSync` try/catch), then reaps the worker:
```ts
let signalHandled = false;
function handleSupervisorSignal(sig: NodeJS.Signals, code: number) {
  if (signalHandled) return;
  signalHandled = true;
  try {
    appendFileSync(logPath, JSON.stringify({
      ts: new Date().toISOString(), event: "cycle.killed", cycle_id: activeCycleId,
    }) + "\n", "utf8");
  } catch { /* write failure must not prevent exit */ }
  const worker = activeWorker;
  if (!worker || worker.exitCode !== null || worker.signalCode !== null) {
    process.exit(code);
  }
  worker.once("exit", () => process.exit(code));        // exit as soon as worker is reaped
  try { worker.kill("SIGTERM"); } catch { /* already gone */ }
  const t = setTimeout(() => {
    try { worker.kill("SIGKILL"); } catch { /* already gone */ }
    process.exit(code);                                  // hard backstop
  }, WORKER_KILL_GRACE_MS);
  t.unref?.();
}
process.on("SIGTERM", () => handleSupervisorSignal("SIGTERM", 143));
process.on("SIGINT", () => handleSupervisorSignal("SIGINT", 130));
```
- Remove the old `process.on("SIGINT", …)`, `process.on("SIGTERM", …)`, and `process.prependListener("SIGTERM", …)` so only the unified handlers run. Keep `process.on("exit", () => releaseLock(lockPath))` (line 227) — it fires on the final `process.exit`, releasing the lock after the worker is reaped. (`activeCycleId` is set/cleared exactly as today around resume and the main loop.)

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean.
- [ ] Integration test: spawn `node dist/cycle.js run` against a repo whose workflow step is a long bash sleep; SIGTERM the supervisor; assert the `run-one` worker pid **and** the bash grandchild pid are dead (`kill(pid,0)` ⇒ ESRCH) within `WORKER_KILL_GRACE_MS + margin`, and the lockfile is released.
- [ ] `cycle.killed` is appended for the active cycle on signal.
- [ ] SIGINT path reaps identically and exits 130.
- [ ] Failure paths behave as designed (no `activeWorker` ⇒ immediate exit; double-signal guarded; marker-append failure still exits; `worker.kill` on a reaped child swallowed).

---

## Task 4: Resume the interrupted cycle, bypassing the residue halt

### Overview
In the resume-from-tail block, when `tail.interrupted` is true, skip arming `pendingResidueContext` and skip `haltIfResidue()`, routing straight to `runResumeOnce` (WIP preserved, no teardown). The non-interrupted path stays byte-for-byte unchanged so the residue guard and the arm→persist structural invariant are untouched.

### Changes Required
**File**: `src/cli.ts` (resume block ~697–753)
**Changes**:
- Gate the arm and the halt on `!tail.interrupted`, keeping the existing whitelisted arm line literally intact:
```ts
if (tail) {
  activeCycleId = tail.cycleId;
  if (!tail.interrupted) {
    pendingResidueContext = { cycleId: tail.cycleId, issueId: tail.issueId, failingStep: undefined };
  }
  if (!tail.interrupted && await haltIfResidue()) {
    halted = true;
    haltReason = "failed_cycle_dirty_worktree";
  } else {
    if (tail.interrupted) {
      await log.emit("engine.resume", {
        cycle_id: tail.cycleId, issue_id: tail.issueId, interrupted: true,
      });
    }
    const result = await runResumeOnce(cwd, log, cfg, args, tail, todoDir, doneDir, failedDir);
    // ...existing result-outcome handling unchanged...
  }
  activeCycleId = undefined;
}
```
- The existing result-outcome handling (ok / terminal / noop / retry-dirty / skipped) is unchanged: a genuine *resumed-run* failure still arms/persists residue exactly as today (the bypass only covers the **pre-resume** halt for the interruption itself).
- The arm line keeps `failingStep: undefined` on a single line ⇒ `WHITELIST` in `scripts/structural-invariants.mjs` still matches ⇒ no invariant change required.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean; `npm run check:invariants` passes (arm→persist invariant intact).
- [ ] Interrupted tail + dirty (engine-non-owned) worktree ⇒ **no** `engine.halted{failed_cycle_dirty_worktree}`; `runResumeOnce` is called; WIP files remain on disk; `engine.resume{interrupted:true}` emitted (cardinality-pinned `filter(...).length === 1`).
- [ ] Re-run executes the interrupted step on top of existing WIP (skip-completed).
- [ ] Regression: a non-interrupted in-flight failure tail still arms the guard and halts unchanged.
- [ ] Failure paths behave as designed (malformed/unreadable tail ⇒ `interrupted:false` ⇒ existing residue-gated path; no silent bypass).

---

## Task 5: Documentation

### Overview
Document the suspend-and-resume behavior, the worker-reaping discipline, and the interrupted marker / `InFlightCycle.interrupted` surface.

### Changes Required
**File**: `CLAUDE.md` — extend *Workflow defaults* / resume notes: signal reaps the `run-one` worker (bounded SIGTERM→grace→SIGKILL) and the worker cascades to its detached agent/bash grandchild; an interrupted cycle is resumable (WIP preserved, no `failed_cycle_dirty_worktree` halt); the residue guard remains the genuine-failure path only. Note `InFlightCycle.interrupted`, the `cycle.killed` interrupted marker, the new `src/engine/active-child.ts` registry, and `WORKER_KILL_GRACE_MS` / `WORKER_CHILD_KILL_GRACE_MS`.

**File**: `docs/ENGINE.md` — add a *Signal interruption — suspend and resume* subsection: worker reaping (supervisor → worker → grandchild), the active-child registry + `run-one` cascade, the interrupted marker, and the interrupted-vs-failed resume branch (fail-closed classification).

**File**: `README.md` — note pause-via-SIGTERM is safe and resumable if a pause/resume or signals section exists; otherwise no change required.

### Success Criteria
- [ ] CLAUDE.md and docs/ENGINE.md describe the suspend-resume behavior and new surfaces.
- [ ] README touched only if a relevant section exists.
- [ ] No code/doc drift (new symbols referenced match the implementation).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] **(User benefit)** After SIGTERM/SIGINT to a running engine, the active `run-one` worker and its agent descendant are terminated — a test asserts no orphaned worker process survives the signal (bounded SIGTERM→grace→SIGKILL). | Task 2 + Task 3 | Supervisor reaps worker; worker cascades to detached grandchild; integration test asserts both dead. |
| [ ] **(User benefit)** A subsequent `cycle run` after a signal interruption **resumes** the interrupted cycle from where it stopped (skip-completed), with the dirty worktree intact, and emits **no** `failed_cycle_dirty_worktree` halt. | Task 4 | Bypass `haltIfResidue`, route to `runResumeOnce`; assert no halt + WIP present. |
| [ ] A signal-interrupted cycle is recorded as interrupted/resumable (marker written and/or `InFlightCycle` surfaces `interrupted: true`); its WIP is present in the tree after the resume begins (never auto-discarded). | Task 1 + Task 3 + Task 4 | `cycle.killed` marker (Task 3) → `InFlightCycle.interrupted` (Task 1) → no-teardown resume (Task 4). |
| [ ] A genuine step-failure cycle still halts/guards exactly as today — the residue guard and terminal-failure paths are unchanged for real failures (asserted by an unchanged failure-path test). | Task 4 | Non-interrupted path is byte-for-byte unchanged; whitelist arm preserved; regression test. |
| [ ] **(Failure-path)** When the interrupted marker / log tail is unreadable or malformed, the resume path degrades to the existing residue-gated behavior (does not silently bypass the guard) and does not throw. | Task 1 + Task 4 | `interrupted` defaults `false` on malformed/skipped lines ⇒ existing path (fail-closed). |
| [ ] **(Failure-path)** Reaping a worker whose PID is already gone (`ESRCH`) is a no-op that still lets the supervisor exit; the signal handler never throws. | Task 2 + Task 3 | ESRCH/EPERM swallowed; handler exits regardless; unit + integration coverage. |
| [ ] All existing tests still pass. | All tasks | `npm test` gate in each task's success criteria. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | All tasks | `npm run typecheck` in each task's success criteria. |

---

## Testing Strategy

### Unit Tests
- **`tests/engine/log-tail.test.ts`** (Task 1): `cycle.killed` after `cycle.start` (no `cycle.end`) ⇒ `interrupted: true`; `cycle.killed` with `cycle_id` undefined ⇒ matches in-flight cycle; `step.end{failed}` with no `cycle.killed` ⇒ `interrupted: false`; malformed `cycle.killed` JSON line ⇒ skipped ⇒ `interrupted: false`; `cycle.end` present ⇒ still `null`.
- **`tests/engine/active-child.test.ts`** (new, Task 2): register/unregister idempotency; `killActiveChildren` on empty set is a no-op; spawn a real detached `sleep`/`node` child, register its pid, `killActiveChildren("SIGTERM")`, assert `kill(pid,0)` ⇒ ESRCH; register an already-dead pid and assert `killActiveChildren` throws nothing (ESRCH path).
- **`tests/engine/exec-spawn.test.ts` / `exec-bash.test.ts`** (Task 2): assert the child pid is registered during the step and unregistered after `close` (drive via a fast stub binary / short script); `exec-bash` child is spawned detached.
- **Failure-path tests**: malformed-tail degrade (Task 1); ESRCH no-throw (Task 2); double-signal guard returns early (Tasks 2 & 3, via the guard flag).
- **Mocking strategy**: prefer real child processes (short `sleep`/`node -e` scripts) over mocks for the reaper; use real filesystem temp repos for log-tail and resume (consistent with `log-tail.test.ts` / `resume.test.ts`).

### Integration / E2E Tests
- **`tests/cli/suspend-resume-integration.test.ts`** (new, mirrors `engine-lock-integration.test.ts`): bootstrap a temp git repo with a `feature` workflow whose single step is a bash script that `echo`s a WIP file then `sleep 60`; `spawn` `node dist/cycle.js run`; wait until the worker + grandchild exist; send SIGTERM to the supervisor; assert (a) the `run-one` worker pid and the bash grandchild pid are dead within `WORKER_KILL_GRACE_MS + margin`, (b) `log.jsonl` contains `cycle.killed`, (c) the WIP file remains. Then re-run `node dist/cycle.js run` and assert it emits `engine.resume{interrupted:true}`, **no** `engine.halted{failed_cycle_dirty_worktree}`, and the WIP file is still present.
- **Regression** (extend `tests/cli/resume.test.ts` or `failed-residue-guard.test.ts`): an in-flight tail that is a genuine terminal failure (no `cycle.killed`) still arms the residue guard and halts unchanged.

### Mocking note
The only place mocking is considered is signal timing in the integration test — handled with real processes and a bounded poll on `kill(pid,0)` rather than mocks, per the repo's anti-mock bias.

## Risk Assessment
- **Worker cannot be reached transitively (detached agent children):** mitigated by the explicit active-child registry + `run-one` cascade (Task 2) — the supervisor does not rely on process-group inheritance to the grandchild.
- **Structural arm→persist invariant breakage:** mitigated by keeping the existing whitelisted `failingStep: undefined` arm line literally intact and gating it behind `!tail.interrupted`; `npm run check:invariants` verifies.
- **Grace-window flakiness in CI:** mitigated by polling `kill(pid,0)` with a timeout margin above `WORKER_KILL_GRACE_MS`, and by using a step that ignores nothing (plain `sleep`) so SIGTERM alone usually suffices, exercising SIGKILL only as backstop.
- **`activeCycleId` not set when the signal arrives (between cycles):** the `cycle.killed` marker records `cycle_id: undefined`; `parseLogTail` only sets `interrupted` when there is an in-flight `cycle.start` with no `cycle.end`, so a between-cycles signal is a clean exit with no spurious interrupted classification.
- **Double exit path race (worker `exit` listener vs grace timer):** both call `process.exit(code)`; first wins, second is a no-op on an exiting process — harmless.
