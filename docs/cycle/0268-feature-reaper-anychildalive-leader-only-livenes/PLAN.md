# Implementation Plan: Cycle 0268

## Overview
Make the active-child reaper's liveness probe symmetric with its kill: `anyChildAlive` in `src/engine/active-child.ts` must probe the **process group** (`process.kill(-pid, 0)`) rather than the group leader (`process.kill(pid, 0)`), with `ESRCH` ⇒ group gone, `EPERM`/other ⇒ fail-closed toward alive, so `reapAndExit`'s fast-poll only declares a subtree dead once the whole group is reaped — closing the orphaned-grandchild window.

## Current State (from Research)
- `anyChildAlive` (`src/engine/active-child.ts:47-57`) iterates the module-level `active: Set<number>` of group-leader PIDs, calls `process.kill(pid, 0)` (leader only), returns `true` on first success, and uniformly swallows **all** probe errors (no `.code` inspection), returning `false` after the loop.
- `killActiveChildren` (`src/engine/active-child.ts:30-42`) already group-kills with `-pid` (negative/group target), with a nested-catch never-throw idiom and a direct-`pid` fallback.
- Consumer `reapAndExit` (`src/cli/run-one.ts:33-61`) wires `anyChildAlive` in as `ReapDeps.anyAlive`; it runs a 100 ms fast-poll that exits the worker the instant `anyAlive()` returns `false`, with a SIGKILL backstop after `graceMs` (`WORKER_CHILD_KILL_GRACE_MS = 5000`). The `anyAlive: () => boolean` contract is unchanged by this cycle.
- Patterns to follow: the reaper-never-throws idiom (every probe wrapped in try/catch, no exception escapes the poll); the `-pid` group-target convention used by `killActiveChildren` and by test cleanup (`process.kill(-pid, "SIGKILL")`); the module is intentionally side-effect-free (no log events, no stderr).
- Tests: `node:test` + `node:assert/strict` in `tests/engine/active-child.test.ts`; existing `anyChildAlive` test (`:85-100`) uses a real detached child (alive→dead) but no `EPERM`/`ESRCH`-discrimination or leader-dead-but-group-alive test exists. SPEC's Testing Strategy prescribes `mock.method` on `process` to stub `process.kill` deterministically and to assert the probed argument is the **negated** pid.
- `src/engine/active-child.ts` has **no** dedicated per-file coverage floor; the aggregate floors apply (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

## Desired End State
`anyChildAlive` probes `process.kill(-pid, 0)` for every registered pid. A surviving group member (leader exited) keeps the probe returning `true`; a fully-reaped group (all `ESRCH`) and an empty registry return `false`; `EPERM` and any other unexpected error return `true` (fail-closed toward alive) and never throw. Verifiable by: reading the source for the `-pid` literal; running the new failure-path tests; `npm run typecheck` clean; `npm test` green; coverage at or above the aggregate floors (reported in `BUILD.md`). CLAUDE.md, AGENTS.md, and docs/ENGINE.md state the probe is group-symmetric.

## What We're NOT Doing
- No change to `killActiveChildren`, `reapAndExit` (`src/cli/run-one.ts`), the poll loop, `WORKER_CHILD_KILL_GRACE_MS`, or the SIGKILL backstop — they already target the group correctly.
- No change to `registerActiveChild` / `unregisterActiveChild` / `activeChildCount` or the cycle-0267 `validateActiveChildRegistration` structural invariant.
- No change to supervisor-side signal forwarding (`activeWorker`, `WORKER_KILL_GRACE_MS`) in `src/cli.ts`.
- No new structured log events / stderr in `active-child.ts` (intentionally side-effect-free).
- No new per-file coverage floor for `active-child.ts` in `scripts/coverage-gate.mjs` (not requested by SPEC).
- No README change (no user-facing surface change).

## Implementation Approach
A single surgical edit to `anyChildAlive`: change the probe target from `pid` to `-pid`, and replace the uniform error-swallow with a `.code`-discriminating catch. The discrimination is: `ESRCH` ⇒ `continue` (this group is gone, keep checking the rest); everything else — `EPERM` (present-but-unsignalable) **and any other unexpected error** — ⇒ `return true`, fail-closed toward "alive" so the SIGTERM→SIGKILL backstop in `reapAndExit` stays authoritative and no error escapes the bounded poll. Collapsing EPERM and other-error into one fail-closed branch resolves RESEARCH's open question on residual-error disposition, is the most conservative choice for a reaper, and keeps the branch set small (ESRCH-continue vs. return-true) while still satisfying every acceptance test (ESRCH ⇒ not-alive, EPERM ⇒ alive). Then add deterministic failure-path tests via per-test `t.mock.method(process, "kill", …)` (auto-restored so a stubbed `process.kill` never leaks across tests), and update docs.

## Failure & Resilience Decisions

**Task 1 — `anyChildAlive` group probe**
- **Failure modes**: `process.kill(-pid, 0)` throws per pid. `ESRCH` (no such process group) ⇒ that group is gone, does not count as alive, loop continues. `EPERM` (group exists but unsignalable) ⇒ `return true` (fail-closed toward alive). Any other unexpected error ⇒ same fail-closed `return true`. No error propagates to the caller / poll.
- **Idempotency**: Pure read-only probe — no state mutation, no subprocess spawn. Inherently safe to re-run; `reapAndExit` calls it repeatedly (every 100 ms). Must stay cheap and non-throwing.
- **Observability**: Module is intentionally side-effect-free (per RESEARCH); no log event added here. Diagnosability is via the consumer (`reapAndExit`'s interruption stderr line and the SIGKILL backstop firing) and the unit tests asserting each branch. The behavior is observable through the worker no longer exiting early when a group member survives.
- **No silent failure**: The catch does not swallow into a wrong answer — `ESRCH` is the only definitive "gone" signal that lets the loop continue; every other outcome surfaces as `true` (alive), which keeps the backstop authoritative rather than masking a live child as dead. The function's return value is the surfaced result; the caller acts on it.

**Task 2 — Tests**: N/A — pure (in-memory; `process.kill` stubbed via auto-restored `t.mock.method`, no real spawning required for the failure-path cases).

**Task 3 — Docs**: N/A — pure (Markdown edits).

---

## Task 1: Make `anyChildAlive` probe group liveness (`-pid`) with `.code`-discriminating catch

### Overview
Change the leader-only probe to a group probe symmetric with `killActiveChildren`, and branch on the error `code` so `ESRCH` continues and `EPERM`/other returns alive.

### Changes Required
**File**: `src/engine/active-child.ts`
**Changes**: Replace the body and header comment of `anyChildAlive` (lines 44-57):

```ts
// Liveness probe used by the reaper's fast-path: returns true if any registered
// child's process GROUP still responds to signal 0. The probe target is the
// negated pid (`-pid`), symmetric with killActiveChildren's group-kill, so the
// probe and the kill agree on what "the child" is: a leader that exits while a
// tool it forked into the same group survives still reports alive. Lets the
// handler exit promptly once SIGTERM has reaped the whole group, rather than
// always waiting the full grace.
export function anyChildAlive(): boolean {
  for (const pid of active) {
    try {
      process.kill(-pid, 0);
      return true;
    } catch (err) {
      // ESRCH ⇒ this group is fully reaped; keep checking the rest.
      if ((err as NodeJS.ErrnoException).code === "ESRCH") continue;
      // EPERM (present-but-unsignalable) or any other unexpected error ⇒
      // fail-closed toward "alive" so the SIGKILL backstop stays authoritative
      // and no probe error escapes reapAndExit's bounded poll.
      return true;
    }
  }
  return false;
}
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`)
- [ ] `npm run typecheck` clean — no warnings (the `NodeJS.ErrnoException` cast typechecks)
- [ ] Source contains `process.kill(-pid, 0)` (negated/group target), verifiable by reading the file
- [ ] `ESRCH` ⇒ loop continues; `EPERM`/other ⇒ `return true`; empty/all-`ESRCH` ⇒ `false`
- [ ] Failure paths behave as designed — no error escapes the function (no silent miscount to "dead")

---

## Task 2: Add failure-path and group-liveness tests for `anyChildAlive`

### Overview
Add deterministic unit tests covering the new branches: leader-dead-but-group-alive, `EPERM` ⇒ alive, `ESRCH` ⇒ not-alive, empty registry ⇒ false, mixed registry ⇒ true, probe target is negated pid, and neither failure path throws.

### Changes Required
**File**: `tests/engine/active-child.test.ts`
**Changes**:
- Extend the import to include `mock`: `import { test, mock } from "node:test"` (and use the per-test mock context `t.mock.method(process, "kill", …)` so the stub auto-restores and never leaks a stubbed `process.kill` into other tests).
- Add tests (stub `process.kill` to simulate per-pid outcomes; register a synthetic pid via `registerActiveChild`, unregister in `finally`):

  1. **Group alive after leader exits / probe target is negated pid**: register pid `P`; stub `process.kill(target, sig)` to record `target` and, for the signal-0 probe, return normally (group member alive). Assert `anyChildAlive() === true` and that the recorded probe `target === -P` (proves symmetry with `killActiveChildren`).
  2. **`EPERM` ⇒ alive, no throw**: stub the probe to throw an error with `code: "EPERM"`. Assert `anyChildAlive() === true` and `assert.doesNotThrow(() => anyChildAlive())`.
  3. **`ESRCH` ⇒ not-alive, no throw**: stub the probe to throw `code: "ESRCH"` for the single registered pid. Assert `anyChildAlive() === false` and does not throw.
  4. **Empty registry ⇒ false**: with no registered pid (capture/clear via unregister of any known test pid), assert `anyChildAlive() === false`.
  5. **Mixed registry ⇒ true**: register two pids `A`, `B`; stub the probe so `-A` throws `ESRCH` and `-B` returns normally; assert `anyChildAlive() === true`.

Follow existing style: synthetic pids (e.g. high unused integers) are fine because `process.kill` is stubbed — no real spawn needed for the failure-path cases; keep the real-child liveness test (`:85-100`) intact.

### Success Criteria
- [ ] `npm test` passes including the new tests
- [ ] Each new branch (`ESRCH`-continue, `EPERM`/other-`return true`, success-`return true`, empty-`false`) is exercised, so branch coverage does not regress
- [ ] A test asserts the probed argument is `-pid` (negated)
- [ ] `EPERM` and `ESRCH` tests both assert no throw (`assert.doesNotThrow`)
- [ ] `process.kill` stub is auto-restored (per-test mock context) — no leakage into other tests in the file/suite
- [ ] Coverage for `src/engine/active-child.ts` at or above aggregate floors; numbers reported in `BUILD.md`

---

## Task 3: Update documentation

### Overview
Reflect the group-symmetric probe in the engine docs and the agent-facing convention files.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: In the *Signal interruption — suspend and resume* bullet (around line 132), add that `anyChildAlive` probes **group** liveness (`process.kill(-pid, 0)`), symmetric with `killActiveChildren`'s `-pid` kill, so the reaper's fast-poll declares a child's subtree dead only when the whole process group is gone — closing the orphaned-grandchild window where a surviving group member outlived its leader.

**File**: `AGENTS.md`
**Changes**: Apply the same edit if AGENTS.md mirrors the CLAUDE.md *Signal interruption* note (keep the two in sync). If AGENTS.md does not carry this content, no change.

**File**: `docs/ENGINE.md` → *Signal interruption — suspend and resume* (worker-reaping paragraph, around lines 88-90)
**Changes**: Note that `anyChildAlive` probes the process group (`-pid`), symmetric with `killActiveChildren`, so the bounded poll keeps the worker alive until the entire group is reaped by the SIGKILL backstop; state the closed orphaned-grandchild window (a forked tool that outlives its leader and ignores SIGTERM is now caught by the backstop instead of escaping as an orphan).

**File**: `README.md`
**Changes**: None (no user-facing surface change).

### Success Criteria
- [ ] CLAUDE.md (and AGENTS.md if it mirrors) describe `anyChildAlive`'s group (`-pid`) probe and its symmetry with `killActiveChildren`
- [ ] docs/ENGINE.md *Signal interruption* section notes the group-liveness probe and the closed orphaned-grandchild window
- [ ] No stale claim that the probe targets the leader remains
- [ ] No `sync-defaults` needed (no `src/defaults/` change)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] With a child registered, the **leader** exited, but a member of the same process group still alive and ignoring SIGTERM, `anyChildAlive()` returns `true` — so `reapAndExit`'s poll does not exit early and the SIGKILL backstop fires, closing the orphaned-grandchild window (user-observable benefit: the surviving subtree is reaped instead of orphaned). | Task 1, Task 2 | Test scenario 1 (group-alive-after-leader-exit) |
| [ ] **Failure path**: when the probe raises `EPERM` for a registered pid, `anyChildAlive()` returns `true` (treats the unsignalable-but-present group as alive) and does not throw; when it raises `ESRCH`, that pid does not keep the group alive and the function does not throw. | Task 1, Task 2 | Test scenarios 2 (EPERM) & 3 (ESRCH) |
| [ ] A fully-reaped group (all members gone, `ESRCH`) reports dead: `anyChildAlive()` returns `false`, and an empty registry returns `false`. | Task 1, Task 2 | Test scenarios 3 (single ESRCH) & 4 (empty) |
| [ ] `anyChildAlive` calls `process.kill(-pid, 0)` (negative/group target), verifiable by reading `src/engine/active-child.ts` and by a test asserting the probed argument is the negated pid. | Task 1, Task 2 | Source literal + test scenario 1 asserts `target === -P` |
| [ ] Coverage for `src/engine/active-child.ts` is at or above its current floor; numbers reported in `BUILD.md`. | Task 2 | Aggregate floors (no per-file floor); reported in BUILD.md |
| [ ] All existing tests still pass. | Task 1, Task 2 | `npm test` green; real-child test untouched |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1 | `NodeJS.ErrnoException` cast typechecks |

---

## Testing Strategy

### Unit Tests
- **Group-alive-after-leader-exit** (acceptance #1): stubbed `process.kill` returns normally for the signal-0 probe of the registered pid ⇒ `anyChildAlive()` returns `true`; assert the recorded probe target is `-pid`.
- **Failure paths**:
  - `EPERM` (probe throws `code: "EPERM"`) ⇒ returns `true`, does not throw (`assert.doesNotThrow`).
  - `ESRCH` (probe throws `code: "ESRCH"`) ⇒ that pid does not keep the group alive; single-pid registry returns `false`, does not throw.
- **Edge cases**: empty registry ⇒ `false`; mixed registry (one pid `ESRCH`, one alive) ⇒ `true`.
- **Branch coverage**: scenarios collectively exercise success-`return true`, `ESRCH`-`continue`, `EPERM`/other-`return true`, and the post-loop `return false`.
- **Mocking strategy**: per-test `t.mock.method(process, "kill", fn)` (auto-restored) for the deterministic failure-path cases — `process.kill` is configurable on the global `process` object (unlike `node:fs/promises`), so this is the prescribed and confirmed-working path. Keep the existing **real**-detached-child liveness test (`:85-100`) as the integration-style cross-check; do not replace real spawning where it already works. Synthetic pids are acceptable only because the kill is stubbed.

### Integration / E2E Tests
- None required (no UI surface; the `reapAndExit` poll integration is out of scope and unchanged — its `anyAlive: () => boolean` contract holds). The retained real-child test in `active-child.test.ts` provides end-to-end confidence that the probe reflects a real process group transitioning alive→dead.

## Risk Assessment
- **Stubbing `process.kill` leaks across tests** → mitigation: use the per-test `t.mock` context so the stub auto-restores; never call the bare module-level `mock.method` without restoration in this file.
- **Synthetic pid collides with a real running process group** → mitigation: the failure-path tests stub `process.kill` entirely, so no real signal is ever sent; the real-child test continues to use spawned detached children with `finally` cleanup (`unregisterActiveChild` + `process.kill(-pid, "SIGKILL")`).
- **`continue` inside the catch misread, dropping to the wrong branch** → mitigation: explicit test for mixed registry (ESRCH pid must not short-circuit; alive pid must) confirms the control flow.
- **Doc drift between CLAUDE.md and AGENTS.md** → mitigation: apply the identical edit to both where the *Signal interruption* note is mirrored.
