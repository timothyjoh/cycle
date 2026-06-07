## Summary

This cycle turns a SIGTERM/SIGINT interruption of a running engine into a clean suspend-and-resume rather than a leak-and-halt, implementing all five PLAN tasks.

**Task 1 — `interrupted` on `InFlightCycle` (`src/engine/log-tail.ts`, +~30 lines).** Added an `interrupted: boolean` field and ordering-based classification: a `cycle.killed` marker (matching the in-flight `cycle_id`, or with an undefined `cycle_id`) marks the cycle interrupted when it has no `cycle.end`, **or** when the kill *precedes* a racy `cycle.end` that the torn-down `runCycle` emits while exiting — the explicit kill marker wins over that spurious terminal. Fail-closed: normal completion, a between-cycles kill (kill *after* a legit `cycle.end`), and a malformed/absent marker all yield `interrupted: false` / `null`.

**Task 2 — active-child registry + `run-one` cascade (`src/engine/active-child.ts` new, ~60 lines; `exec-spawn.ts`/`exec-bash.ts`/`run-one.ts` modified).** New registry (`registerActiveChild`/`unregisterActiveChild`/`killActiveChildren`/`anyChildAlive`, `WORKER_CHILD_KILL_GRACE_MS=5000`) records each step lane's group-leader PID. `exec-spawn` and `exec-bash` (now also `detached: true`, own process group) register on spawn and unregister on close/error. `run-one`'s `reapAndExit` (extracted with injectable deps for unit testing) group-kills every child SIGTERM→poll→SIGKILL and exits; `killActiveChildren` group-kills `-pid` with a direct-kill fallback and swallows ESRCH/EPERM (a reaper never throws).

**Task 3 — supervisor reaps the worker (`src/cli.ts`).** Replaced the three old signal listeners with one guarded `handleSupervisorSignal` that writes the `cycle.killed` marker (best-effort), then forwards bounded SIGTERM→grace→SIGKILL (`WORKER_KILL_GRACE_MS=5000`) to the tracked `activeWorker` (set in `spawnRunOne`, cleared on close/error) before exiting 143/130. An absent/already-exited worker exits immediately.

**Task 4 — interrupted resume branch (`src/cli.ts`).** The resume-from-tail block now gates `pendingResidueContext` arming and `haltIfResidue()` on `!tail.interrupted`; for an interrupted tail it emits `engine.resume { interrupted: true }` and routes straight to the unchanged `runResumeOnce` with no teardown (WIP preserved). The non-interrupted path — including the whitelisted `failingStep: undefined` arm — is byte-for-byte unchanged, so the arm→persist structural invariant is unaffected (`5 paired`).

**Task 5 — docs.** Added a *Signal interruption — suspend and resume* subsection to `docs/ENGINE.md`, a Workflow-defaults bullet to `CLAUDE.md`, and a pause-via-SIGTERM bullet to `README.md`'s Failure-handling section.

**PLAN tasks complete:** Tasks 1–5 all landed end-to-end.

**Test suite:** `npm test` → **1158 tests, 1158 pass, 0 fail** (exit 0). `npm run typecheck` clean. `npm run check:invariants` clean (all entries ok, including the residue arm/persist `5 paired`).

**Coverage:** `npm run test:coverage` exited 0 — every per-file floor green. New/changed files: `src/engine/exec-spawn.ts` 100%, `src/engine/exec-bash.ts` 100%, `src/engine/run-cycle.ts` 100%, `src/cli/run-one.ts` **77.59% ≥ 70%** (regressed to 61.27% after adding the signal handler, then restored above the floor by extracting `reapAndExit` with injectable deps and adding three unit tests covering the no-children, fast-poll-exit, and SIGKILL-backstop branches). `src/engine/active-child.ts` and `src/engine/log-tail.ts` carry no per-file floor; both are exercised directly by new tests. No floor regressed.

**Failure modes handled this cycle:**
- *Reap of an already-gone worker/child (ESRCH/EPERM):* `killActiveChildren` and the supervisor's `worker.kill` swallow the error and still exit — covered by `active-child.test.ts` ("already-dead pid is a no-throw no-op") and the `n===0`/backstop `reapAndExit` unit tests.
- *Worker ignoring SIGTERM:* SIGKILL-after-grace backstop in both `run-one` and the supervisor — covered by the `reapAndExit` backstop unit test.
- *Marker-append failure:* supervisor handler keeps the existing best-effort try/catch and still exits.
- *Malformed/unreadable log tail:* `parseLogTail` defaults `interrupted: false` ⇒ existing residue-gated path (no silent bypass) — covered by the malformed-`cycle.killed` and between-cycles log-tail tests, and the genuine-failure regression at `failed-residue-guard.test.ts` ("resume path halts before runResumeOnce").
- *Idempotency:* registry is a `Set` (double register/unregister no-op); the supervisor (`signalHandled`) and worker (`handlingSignal`) handlers run once; resume re-executes only the interrupted step via skip-completed.
- *Spurious `cycle.end` race:* the ordering-based classification resumes correctly regardless of the torn-down `runCycle` racing to write `cycle.end{failed}` — covered by the "cycle.killed precedes a racy cycle.end" log-tail test and the full integration test.

**Failure-path tests added:** `tests/engine/log-tail.test.ts` (interrupted true/false, undefined cycle_id, foreign cycle_id, malformed marker, kill-before-end race, kill-after-end between-cycles); `tests/engine/active-child.test.ts` (idempotency, empty-set no-op, real detached-child reap, ESRCH no-throw, liveness); `tests/cli/run-one.test.ts` (`reapAndExit` no-children / fast-poll / SIGKILL-backstop); `tests/engine/exec-bash.test.ts` (register-during / unregister-on-error); `tests/cli/failed-residue-guard.test.ts` (interrupted tail bypasses halt, WIP intact); `tests/cli/suspend-resume-integration.test.ts` (new end-to-end: SIGTERM reaps worker + agent grandchild via `kill(pid,0)`→ESRCH, `cycle.killed` logged, WIP preserved, re-run emits `engine.resume{interrupted:true}` with no `failed_cycle_dirty_worktree` halt).

**Deviations from PLAN:** (1) `parseLogTail` uses ordering-based classification (kill-vs-end position) instead of the PLAN's "scan for cycle.killed after a confirmed no-cycle.end" — necessary because the worker's bounded reap lets `runCycle` race to emit a spurious `cycle.end{failed}` after `cycle.killed`; honoring the kill marker over the racy terminal is the robust fix and correctly excludes the between-cycles-kill case. (2) `run-one`'s `reapAndExit` was extracted as an exported, dependency-injected function (not the PLAN's inline closure) so the reap branches are unit-testable without killing the test runner, which was required to restore the `run-one.ts` 70% floor. Both stay within SPEC scope.

**Deferred / follow-up:** None required by SPEC. As noted out-of-scope: richer "WIP may exist" prompt wording for the resumed step remains a follow-up; agent-child `detached: true` is retained (the worker cascades explicitly rather than relying on group inheritance).

## Touched Files
- src/engine/log-tail.ts
- src/engine/active-child.ts
- src/engine/exec-spawn.ts
- src/engine/exec-bash.ts
- src/cli/run-one.ts
- src/cli.ts
- tests/engine/log-tail.test.ts
- tests/engine/active-child.test.ts
- tests/engine/exec-bash.test.ts
- tests/cli/run-one.test.ts
- tests/cli/failed-residue-guard.test.ts
- tests/cli/suspend-resume-integration.test.ts
- CLAUDE.md
- docs/ENGINE.md
- README.md
