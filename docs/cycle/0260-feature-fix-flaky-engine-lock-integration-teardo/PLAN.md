# Implementation Plan: Cycle 0260

## Overview
Harden the temp-directory teardown in `tests/cli/engine-lock-integration.test.ts` against the known descendant-process write-after-exit race by adding bounded `maxRetries`/`retryDelay` options to all six `rm(...)` cleanup calls, and record in BUILD.md that the observed `ENOTEMPTY` flake is a test-teardown-ordering race, not a production signal-propagation bug.

## Current State (from Research)
- `rm` is imported from `node:fs/promises` at `tests/cli/engine-lock-integration.test.ts:3`.
- Six teardown sites, all in `finally` blocks, all currently `{ recursive: true, force: true }` with no retry options:
  - `:78` (`live lock`), `:107` (`stale lock`), `:244` (`SIGINT`), `:292` (`SIGTERM`, after `child?.kill()` at `:291`), `:358` (`SIGTERM idle` root, after `child?.kill()` at `:357`), `:359` (`SIGTERM idle` `fakeBinDir`).
- The signal tests spawn the supervisor (`node dist run`), which spawns a `run-one` child, which spawns a `sleep 30` bash grandchild. The supervisor's SIGTERM/SIGINT handlers (`src/cli.ts:201–216`) exit and release the lock but do **not** explicitly kill the `run-one`/`sleep` descendants (`spawnRunOne` at `src/cli.ts:420–447` is non-detached, no kill; `execBashStep` at `src/engine/exec-bash.ts:28–32` is non-detached, no process-group teardown). A descendant still exiting after the supervisor exits can write into `root` and race the `rm`'s final `rmdir`, producing `ENOTEMPTY`.
- Node's `fs.rm` `maxRetries`/`retryDelay` already retries exactly the transient codes `EBUSY`/`EMFILE`/`ENFILE`/`ENOTEMPTY`/`EPERM`; a genuinely stuck directory still throws after the budget.
- Conventions to follow: each test owns an isolated `mkdtemp` root, torn down in `finally`; exactly-once events asserted via `filter(...).length === 1`; no mocking (real-subprocess integration tests against the built `dist/cycle.js`).

## Desired End State
Every `rm(root, …)` and the `fakeBinDir` cleanup in `tests/cli/engine-lock-integration.test.ts` carries `maxRetries: 10, retryDelay: 50` alongside `recursive: true, force: true`. The file run 20 times in a loop produces zero `ENOTEMPTY`/`EBUSY`/`EPERM` teardown failures, every existing assertion is unchanged and passing, `npm test` is green, and `npm run typecheck` is clean. BUILD.md records the loop result and the option-3 finding (teardown-ordering race, not a production defect).

**Verify**: read the file (six `rm` calls each show the retry options); run `for i in $(seq 1 20); do node --experimental-strip-types --test tests/cli/engine-lock-integration.test.ts; done` (or via the suite runner) and confirm no teardown failure; `npm test` and `npm run typecheck` pass.

## What We're NOT Doing
- No change to production signal-handling / process-group teardown in `src/cli.ts`, `src/engine/exec-bash.ts`, or the engine. (Deferred to a sibling cycle, and only if option-3 investigation proves a production defect — it does not.)
- No refactor of the test's spawn/wait helpers (`waitForLock`, `waitForAbsence`, `waitForLogEvent`), the slow-workflow fixture (`slowWorkflowYml`/`scripts/slow.sh`), or `bootstrapRepo`.
- No change to any assertion (lock-absence checks, exit-code `143`, the exactly-one `cycle.killed` cardinality check).
- No teardown hardening in other test files (e.g. `tests/cli/run-one.test.ts`) — only the one observed-flaky file.
- No new project-wide convention, coverage floor, or structural invariant for the retry pattern.
- No new test case — this hardens teardown of existing tests; the failure-path requirement is satisfied by reasoning recorded in BUILD.md.

## Implementation Approach
A single localized edit per teardown site: append `maxRetries: 10, retryDelay: 50` to the options object of each of the six `rm(...)` calls. The literal values `10`/`50` are used uniformly across all six sites (resolving the RESEARCH open question on retry budget) — a 10-attempt budget with 50 ms spacing gives up to ~500 ms of bounded retry, ample for a descendant to finish exiting, while adding zero measurable delay on the common first-attempt-success path. No control-flow, helper, or assertion changes. Because `recursive`/`force`/`maxRetries`/`retryDelay` are independent option keys, the existing behavior is preserved exactly except that the transient race codes are now retried instead of thrown immediately.

The option-3 confirmation is investigation + documentation only: RESEARCH already establishes the supervisor does not explicitly kill its `run-one`/`sleep` descendants, so the observed `ENOTEMPTY` is a teardown-ordering race in the test (the descendant outlives the supervisor exit the test awaits), not a signal-propagation defect — the assertions already prove the supervisor exits and the lock is removed. This finding, plus the loop-run result and the failure-path reasoning, is recorded in BUILD.md. No production fix is shipped or required this cycle.

## Failure & Resilience Decisions

### Task 1 — add retry options to the six `rm` teardown calls
- **Failure modes**: (a) Transient descendant-write race → `rm` now retries `ENOTEMPTY`/`EBUSY`/`EPERM`/`EMFILE`/`ENFILE` up to `maxRetries: 10` with `retryDelay: 50` ms between attempts, and succeeds once the descendant has finished writing — the directory is removed instead of throwing. (b) Genuinely un-removable directory (non-transient, e.g. a permission/handle problem that persists past the budget) → `rm` still throws after retries are exhausted; the `finally` does not catch it, so the test fails loudly. The retry only suppresses the transient codes Node's `fs.rm` is documented to retry; every other error class propagates on the first attempt.
- **Idempotency**: `rm(..., { recursive: true, force: true })` is already idempotent (`force` suppresses `ENOENT` on a missing path), and re-running the teardown is safe. The engine retries/restarts steps, but this is test-harness teardown in a `finally`; adding retry options does not change idempotency — a re-run still removes (or finds-already-removed) the temp root.
- **Observability**: On a hard (non-transient or post-budget) failure, the thrown `rm` error propagates out of the test and is surfaced by the `node:test` runner as a failed test with the error/stack — the failure is diagnosable. The transient-success path is silent by design (correct teardown is not an event). No production log events are involved.
- **No silent failure**: No `try/catch` is added around any `rm`. A real, persistent teardown failure still throws and fails the test. The race fix never swallows a true teardown error.

### Task 2 — record option-3 finding and loop result in BUILD.md
- N/A — pure (documentation; no I/O, subprocess, or filesystem-write surface in the deliverable itself).

---

## Task 1: Add bounded retry options to all six `rm` teardown calls

### Overview
Append `maxRetries: 10, retryDelay: 50` to the options object of every `rm(...)` cleanup call in the test file, making each recursive removal retry the transient race codes Node's `fs.rm` already retries.

### Changes Required
**File**: `tests/cli/engine-lock-integration.test.ts`

**Changes**: At each of the six sites, change

```ts
await rm(root, { recursive: true, force: true });
```

to

```ts
await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
```

Apply identically at:
- `:78` — `live lock` finally (`rm(root, …)`)
- `:107` — `stale lock` finally (`rm(root, …)`)
- `:244` — `SIGINT` finally (`rm(root, …)`)
- `:292` — `SIGTERM` finally (`rm(root, …)`, after the existing `child?.kill()` at `:291`)
- `:358` — `SIGTERM idle` finally (`rm(root, …)`, after the existing `child?.kill()` at `:357`)
- `:359` — `SIGTERM idle` finally (`rm(fakeBinDir, …)`)

No other lines change. The `child?.kill()` calls, all assertions, all helpers, and the import line stay byte-for-byte as-is. (The `rm` import at `:3` already exists; no import change needed.)

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build` via `pretest`; `npm run typecheck` clean — no warnings).
- [ ] All existing tests pass (`npm test` green).
- [ ] Reading the file shows all six `rm` calls invoked with `maxRetries: 10, retryDelay: 50` alongside `recursive`/`force` (verifiable by `grep -n 'maxRetries' tests/cli/engine-lock-integration.test.ts` returning six lines).
- [ ] The SIGINT test still asserts lock absence after the supervisor exits; the SIGTERM test still asserts exit code `143`, lock absence, and exactly one `cycle.killed` event — all unchanged and passing.
- [ ] Running the file 20 times in a loop produces zero `ENOTEMPTY`/`EBUSY`/`EPERM` teardown failures.
- [ ] Failure paths behave as designed: no `try/catch` is added; a non-transient teardown error still throws and fails the test (errors surfaced, no silent catch).

---

## Task 2: Record loop result and option-3 finding in BUILD.md

### Overview
Document the verification and the option-3 determination so "done" is provable from the in-cycle notes, per SPEC.

### Changes Required
**File**: in-cycle `BUILD.md` (the build step's artifact for this cycle)

**Changes**: Record:
1. The loop-run result — the file run 20 consecutive times with zero `ENOTEMPTY`/`EBUSY`/`EPERM` teardown failures (paste the loop command and the pass/fail tally).
2. The option-3 finding: the observed `ENOTEMPTY` is a **test-teardown-ordering race**, not a production signal-propagation defect. Evidence: the supervisor's SIGTERM/SIGINT handlers (`src/cli.ts:201–216`) exit and release the lock but do not explicitly kill the non-detached `run-one` child (`spawnRunOne`, `src/cli.ts:420–447`) or its non-detached `sleep 30` bash grandchild (`execBashStep`, `src/engine/exec-bash.ts:28–32`); the existing assertions already prove the supervisor exits and the lock is removed. The descendant simply outlives the awaited supervisor exit and can write into `root` while `rm` runs. No production fix is shipped this cycle; if a production process-group teardown is later wanted, it is deferred to a named sibling cycle.
3. The failure-path reasoning: the retry options only suppress the transient codes `fs.rm` is documented to retry (`EBUSY`/`EMFILE`/`ENFILE`/`ENOTEMPTY`/`EPERM`); a genuinely stuck directory still throws after the bounded budget, and no `try/catch` was added — a hard teardown failure still fails the test loudly.

### Success Criteria
- [ ] BUILD.md states the 20× loop produced zero teardown failures.
- [ ] BUILD.md records the option-3 finding (teardown-ordering race, not a production defect) with the supporting code references, and explicitly notes that any production fix is deferred to a sibling cycle.
- [ ] BUILD.md records the failure-path reasoning (transient-only suppression; hard failures still throw; no silent catch).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] Running `tests/cli/engine-lock-integration.test.ts` 20 times in a loop produces zero `ENOTEMPTY`/`EBUSY`/`EPERM` teardown failures (the user-observable benefit: the SIGINT/SIGTERM tests pass reliably under repeated runs). | Task 1 | Verified by loop run; result recorded in Task 2. |
| [ ] Every `rm(root, …)` and the `fakeBinDir` cleanup in the file is invoked with bounded `maxRetries` + `retryDelay` (verifiable by reading the file). | Task 1 | All six sites. |
| [ ] The SIGINT test still asserts the lock is absent after the supervisor exits; the SIGTERM test still asserts exit code `143`, lock absence, and exactly one `cycle.killed` event — all unchanged and passing. | Task 1 | Assertions byte-for-byte unchanged. |
| [ ] Failure-path: when the recursive removal cannot complete (a non-transient error persists past the retry budget), the teardown still throws and the test fails rather than passing silently — confirmed by reasoning recorded in the build notes (the retry only suppresses the transient codes Node's `fs.rm` retries; a hard failure still propagates). | Task 1, Task 2 | No `try/catch` added; reasoning recorded in BUILD.md. |
| [ ] The build notes state whether option-3 (orphaned descendant / signal-propagation) was found to apply; if it does, the production fix is explicitly deferred to a named sibling cycle and this cycle ships only the test hardening. | Task 2 | Finding: teardown-ordering race, not a production defect; any production fix deferred. |
| [ ] All existing tests still pass (`npm test` green). | Task 1 | Full suite. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1 | `tsc --noEmit` clean. |

---

## Testing Strategy

### Unit Tests
- No new unit tests. This cycle hardens teardown of existing tests; SPEC and RESEARCH state no new test case is required.
- Failure-path coverage: by design (reasoning, not a test) — the retry options suppress only the transient codes `fs.rm` retries; a non-transient or post-budget failure still throws out of the `finally` with no catch, surfacing as a failed `node:test`. Synthesizing a genuinely-stuck-directory scenario reliably across platforms is out of scope and would itself be flaky; the requirement is met by recorded reasoning.
- Mocking strategy: none — these are real-subprocess integration tests spawning the built `dist/cycle.js`; preserve that (anti-mock bias).

### Integration / E2E Tests
- **Happy path / regression**: `npm test` — full suite stays green; the file's `live lock`, `stale lock`, `SIGINT`, `SIGTERM`, and `SIGTERM idle` assertions pass unchanged.
- **Race reproduction / fix**: run the single file in a 20-iteration loop and confirm zero `ENOTEMPTY`/`EBUSY`/`EPERM` teardown failures; record the result in BUILD.md.
- **Type/lint gate**: `npm run typecheck` clean.

## Risk Assessment
- **Retry budget too short to clear the race**: `maxRetries: 10` × `retryDelay: 50` ms ≈ up to ~500 ms of bounded retry — comfortably longer than a `sleep`-grandchild's post-exit settle window. Mitigation: the 20× loop verification catches an insufficient budget before the cycle is accepted; values can be raised within the same bounded pattern if the loop still flakes.
- **Suite slowdown**: negligible — on the common no-race path `rm` succeeds on the first attempt and the retry options add no delay; retries only occur on the rare race.
- **Masking a real teardown bug**: avoided — `fs.rm` retries only the documented transient codes and no `try/catch` is added, so any genuine, persistent failure still throws and fails the test loudly.
- **Accidental assertion drift while editing**: mitigated by limiting each edit to appending two keys to the `rm` options object and leaving every assertion/helper line untouched; `npm test` confirms intent is preserved.
