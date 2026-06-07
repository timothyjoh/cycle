# Review: Cycle 0265

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

One Critical issue: `npm run typecheck` fails with two `TS2345` errors in `src/cli/run-one.ts`, violating the CLAUDE.md no-warnings gate and the SPEC's "typecheck clean" acceptance criterion. BUILD.md claims typecheck is clean — it is not. Everything else (functionality, tests, coverage, docs) is solid.

## Code Quality Review

### Summary
The implementation faithfully delivers suspend-and-resume across all five PLAN tasks: a supervisor → worker → grandchild reaping cascade, an `interrupted` log-tail classifier, and an interrupted-resume branch that bypasses the residue halt while leaving the genuine-failure path byte-for-byte unchanged. The code is clean, fail-closed, and mirrors existing kill-grace conventions. The sole defect is a type-level error that the type-stripped test runner cannot catch.

### Findings
1. **Typecheck (Critical)**: `ci(poll)` does not typecheck — the default `clearInterval` rejects the injectable `{ unref?: () => void }` handle type — `src/cli/run-one.ts:48` and `src/cli/run-one.ts:57` (root cause at `src/cli/run-one.ts:43`). See MUST-FIX Task 1.
2. **Observability (good)**: every reap error path is swallowed-by-design but the reaper writes a diagnostic stderr line when children are present (`src/cli/run-one.ts:39`); marker-append failure is best-effort and never blocks exit (`src/cli.ts` `handleSupervisorSignal`). No silent failure.
3. **Fail-closed classification (good)**: `interrupted` defaults `false`; malformed/absent `cycle.killed`, normal completion, and between-cycles kills all degrade to the existing residue-gated path — `src/engine/log-tail.ts:72`. No fail-open guard bypass for real failures.
4. **Idempotency (good)**: registry is a `Set` (double register/unregister no-op); `signalHandled`/`handlingSignal` guards make both handlers run once; resume re-executes only the interrupted step via skip-completed.
5. **Minor (non-blocking)**: `anyChildAlive` probes the group-leader pid positively (`src/engine/active-child.ts:51`); a surviving grandchild whose leader has died would read as "all dead". Acceptable for the bash-sleep leader case and backstopped by the SIGKILL timer — noted, not a fix.

### Spec Compliance Checklist
- [x] SIGTERM/SIGINT reaps the `run-one` worker (bounded SIGTERM→grace→SIGKILL) — `src/cli.ts` `handleSupervisorSignal`, `WORKER_KILL_GRACE_MS = 5000`
- [x] Worker cascades to detached agent/bash grandchild — `src/engine/active-child.ts` + `src/cli/run-one.ts` `reapAndExit`; `exec-bash` now `detached: true`
- [x] Interrupted cycle recorded/resumable; `InFlightCycle.interrupted` surfaced — `src/engine/log-tail.ts:16,72`
- [x] Interrupted resume bypasses `haltIfResidue`, no teardown, WIP preserved, emits `engine.resume { interrupted: true }` — `src/cli.ts` resume block
- [x] Genuine step-failure path unchanged; whitelisted `failingStep: undefined` arm preserved; `check:invariants` passes (`5 paired`)
- [x] Failure paths: ESRCH/EPERM swallowed, handlers never throw, malformed tail degrades fail-closed
- [x] All existing tests pass (1158/1158)
- [ ] **No compiler/linter warnings (`npm run typecheck` clean)** — FAILS (2× TS2345)
- [x] Docs updated: CLAUDE.md, docs/ENGINE.md, README.md
- [x] SPEC has `## Acceptance Criteria` (8 testable bullets); PLAN has complete `## SPEC Acceptance Traceability`
- [x] CONCRETE USER BENEFIT deliverable end-to-end — verified by `suspend-resume-integration.test.ts` (signal reaps worker + grandchild via `kill(pid,0)`→ESRCH, WIP preserved, re-run resumes with no residue halt)

## Adversarial Test Review

### Summary
Strong. Tests use real child processes, real signals, and real PID-liveness polling rather than mocks; the only mock seam is the injectable fake-timer in the `reapAndExit` unit tests, which is justified (you cannot let real timers exit the test runner). The end-to-end integration test exercises the full supervisor→worker→grandchild path against `dist/cycle.js`.

### Findings
1. **Reaper coverage**: `active-child.test.ts` covers register/unregister idempotency, undefined-pid no-op, empty-set no-throw, real detached-child SIGTERM reap, ESRCH already-dead no-throw, and `anyChildAlive` liveness — `tests/engine/active-child.test.ts:32-104`.
2. **`reapAndExit` branches**: no-children-immediate-exit, fast-poll-exit (with interval clear assertion), and SIGKILL-backstop are all driven via fake timers with specific assertions on `exits`/`kills`/`writes` — `tests/cli/run-one.test.ts:43-93`.
3. **Classification**: log-tail tests cover interrupted true/false, undefined `cycle_id`, foreign `cycle_id`, malformed marker, kill-before-end race, and kill-after-end between-cycles — `tests/engine/log-tail.test.ts`.
4. **Regression preserved**: the genuine-failure residue path still halts before `runResumeOnce` (existing test retained); the new interrupted-bypass test asserts zero `failed_cycle_dirty_worktree` halts and WIP intact — `tests/cli/failed-residue-guard.test.ts:269-302`.
5. **Assertion quality**: assertions are specific (`exits === [143]`, `cleared.length === 1`, exact stderr regex, exit code `143`); exactly-once events cardinality-pinned with `filter(...).length === 1`.
6. **Gap (covered by floor, not a fix)**: the `onWorkerSignal` wrapper and `process.on` registrations (`run-one.ts:64-75`) are not unit-tested — untestable without killing the runner; the logic is exercised by the integration test.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (all files): 46.07% / 88.62% / 49.68% (global figure includes CLI entry never unit-loaded; all per-file floors enforced and green)
- `src/cli/run-one.ts`: 77.59% line / 83.33% branch / 50.00% function — ≥ 70% floor (uncovered: signal-handler wrapper 64-75, `runOne` 148-174, both integration-only)
- Regressions vs base (per-file): none — every floor reported `coverage-gate: ok`
- New code without tests: none material (`active-child.ts`, `log-tail.ts` interrupted branch, `reapAndExit`, exec-lane register/unregister all directly tested)
- Specific scenarios missing tests: none required by SPEC

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `WORKER_KILL_GRACE_MS = 5000` supervisor grace | `CLAUDE.md:132` | `src/cli.ts` (`const WORKER_KILL_GRACE_MS = 5000`) | OK |
| Supervisor writes `cycle.killed` marker then reaps `activeWorker` | `docs/ENGINE.md:91` | `src/cli.ts` `handleSupervisorSignal` (`appendFileSync` + `worker.kill`) | OK |
| `WORKER_CHILD_KILL_GRACE_MS = 5000` | `CLAUDE.md:132`, `docs/ENGINE.md:93` | `src/engine/active-child.ts:12` | OK |
| `registerActiveChild`/`unregisterActiveChild`/`killActiveChildren` registry | `CLAUDE.md:132` | `src/engine/active-child.ts:14,18,30` | OK |
| `reapAndExit` group-kills SIGTERM→poll→SIGKILL | `docs/ENGINE.md:93` | `src/cli/run-one.ts:33-61` | OK |
| `exec-bash` steps spawned `detached: true` | `CLAUDE.md:132`, `docs/ENGINE.md:93` | `src/engine/exec-bash.ts` (`detached: true`) | OK |
| `parseLogTail` surfaces `InFlightCycle.interrupted` (kill wins over racy `cycle.end`) | `CLAUDE.md:132`, `docs/ENGINE.md:95` | `src/engine/log-tail.ts:16,72` | OK |
| Interrupted tail bypasses `haltIfResidue`, emits `engine.resume { interrupted: true }`, no teardown | `CLAUDE.md:132`, `docs/ENGINE.md:95` | `src/cli.ts` resume block (`!tail.interrupted` gates; `engine.resume` emit) | OK |
| Pause via SIGTERM reaps worker + agent child, records interrupted, resumes with WIP intact | `README.md:231` | `src/cli.ts` + `src/cli/run-one.ts` + `src/engine/log-tail.ts` (above) | OK |

All enumerated doc claims are backed by HEAD source. Pass 3: no unbacked claims.
