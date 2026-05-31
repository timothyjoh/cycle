# Implementation Plan: Cycle 0013

## Overview
Extract the three near-verbatim terminal-failure bookkeeping blocks in the `src/cli.ts` supervisor loop (commit-failure, fast-bail, budget-exhausted) into a single pure exported helper, `recordTerminalFailure`, hosted in a new `src/engine/halt-accounting.ts` module. All three call sites route through it and act on a returned `{ halt }` decision, eliminating the drift hazard while preserving halt and failure-counting semantics byte-for-byte.

## Current State (from Research)
- `src/cli.ts` is a top-level script with **no exports**; supervisor logic runs as a module side effect ending in `process.exit(...)`. Unit-testable supervisor logic is therefore hosted in importable `src/engine/*.ts` modules (precedent: `src/engine/iteration-guard.ts`'s `advanceFastFailCounter`, unit-tested in `tests/engine/iteration-guard.test.ts`).
- The three in-scope terminal-failure copies live inside the `while (!halted)` loop (`src/cli.ts:453-610`):
  1. **Commit-failure** — `src/cli.ts:530-541` — `failingStep` literal `"commit"`.
  2. **Fast-bail** — `src/cli.ts:579-590` — preceded by a `step.warning { reason: "iteration_too_fast" }` emit; `failingStep` is the resolved variable.
  3. **Budget-exhausted** — `src/cli.ts:595-606` — `failingStep` is the resolved variable.
- Each copy, *after* awaiting `terminalDrain(...)`, runs identically:
  ```
  consecutiveFailures += 1;
  failedCycles.push(cycleId);
  lastHaltContext = { issueId, failingStep };
  fastFailKey = null;
  fastFailCount = 0;
  if (consecutiveFailures >= maxConsecutiveFailures) {
    halted = true;
    haltReason = "max_consecutive_failures";
    activeCycleId = undefined;
    break;
  }
  ```
- `HaltContext` type at `src/cli.ts:35` is `{ issueId: string; failingStep: string | undefined }`. `FastFailState` (`{ key: string | null; count: number }`) is exported from `src/engine/iteration-guard.ts:59`.
- The single `engine.halted` emit is *after* the loop (`src/cli.ts:612-618`), guarded by `halted && haltReason === "max_consecutive_failures" && failedCycles.length > 0`. SPEC forbids changing its payload or the `terminalDrain` signature.
- **Out of scope (do NOT touch):** resume-block terminal copy (`src/cli.ts:439-447` — no fast-fail reset, no inline break), success-path counter reset (`src/cli.ts:544-551`), retry-drain (`src/cli.ts:591-593`), triage-failure halt (`src/cli.ts:456-461`).

## Desired End State
- A new `src/engine/halt-accounting.ts` exports `HaltContext` and a pure `recordTerminalFailure(prev, opts)` returning the post-increment counters, new `lastHaltContext`, reset `FastFailState`, and a `halt: boolean` decision.
- `src/cli.ts:35` no longer defines `HaltContext` locally — it imports it from `src/engine/halt-accounting.ts`.
- All three in-scope branches call `recordTerminalFailure(...)`, assign the returned state to the loop `let` variables, and keep `halted`/`haltReason`/`activeCycleId = undefined`/`break` visible at the call site.
- New `tests/engine/halt-accounting.test.ts` unit-tests the helper directly.
- Verify: `npm run typecheck` clean; `npm test` green; `npm run test:coverage` shows no overall coverage decrease and the new file meets its floor.

## What We're NOT Doing
- Not changing the `terminalDrain` call signature or the `engine.halted` payload.
- Not folding `terminalDrain(...)` into the helper — it stays awaited at each call site *before* bookkeeping.
- Not hiding `break`, `halted`, `haltReason`, or `activeCycleId = undefined` inside the helper — control flow stays at the call site.
- Not touching the resume-block terminal copy (`src/cli.ts:439-447`), the success-path reset, the retry-drain branch, or the triage-failure halt.
- Not altering `advanceFastFailCounter`, halt reasons, thresholds, or backoff behavior.
- Not adding the fast-bail site's `step.warning` emit into the helper — it stays inline at the fast-bail site.

## Implementation Approach
Mirror the `advanceFastFailCounter` precedent: a **pure, exported, side-effect-free** function in `src/engine/`, returning a decision object the caller acts on. Because the bookkeeping mutates five loop variables, the helper takes the two accumulating values it needs to read (`consecutiveFailures`, `failedCycles`) plus the per-site inputs, and returns a fully-resolved next-state object. The caller reassigns its loop `let`s from that object and inspects `.halt` to decide whether to halt and `break`. `failedCycles` is returned as a **new array** (`[...prev, cycleId]`) rather than mutated in place, keeping the helper pure; the caller reassigns `failedCycles = result.failedCycles`. `HaltContext` moves into the new module to avoid a duplicate type and is imported back into `cli.ts`.

This makes the bookkeeping unit-testable in-memory (no subprocess spawn), directly satisfying the SPEC acceptance bullets about per-path bookkeeping deltas and `lastHaltContext` field correctness.

## Failure & Resilience Decisions

**Task 1 — `recordTerminalFailure` helper:** N/A — pure. The function performs no I/O, no subprocess, no filesystem write; it is a deterministic in-memory state transition over its arguments. Re-running it with the same inputs yields the same output (referentially transparent). It returns a new array and never mutates its inputs, so it is safe to call any number of times. There is no failure surface to swallow.

**Task 2 — `cli.ts` call-site rewiring:** The failure-path *behavior* is preserved, not newly introduced.
- **Failure modes**: The only fallible operations at each site remain the pre-existing `await terminalDrain(...)` (filesystem frontmatter stamp + issue move + blocked propagation) and `await log.emit(...)`. Their failure behavior is unchanged — this cycle does not wrap, retry, or suppress them. If `terminalDrain` rejects, the rejection propagates exactly as today (the supervisor's top-level `await` surfaces it; no new `try/catch` is introduced).
- **Idempotency**: The bookkeeping itself is in-process module state (`consecutiveFailures`, `fastFailKey`, `fastFailCount`) not persisted to disk; the engine's single-engine PID lockfile (`acquireLock`/`releaseLock`) prevents concurrent mutation. The engine retries a *cycle* by re-popping the queue row (attempt++), not by re-executing a half-completed bookkeeping block — so the increment cannot double-count on retry. The refactor changes none of this.
- **Observability**: The failure path's observable events are unchanged: `terminalDrain` emits its existing events, the fast-bail site still emits `step.warning { reason: "iteration_too_fast", ... }` inline before calling the helper, and crossing the threshold still emits exactly one post-loop `engine.halted { failed_cycles, reason, threshold }`. `engine.stop` still carries `halted_at_issue`/`failing_step` from `lastHaltContext`.
- **No silent failure**: The helper returns its halt decision; the caller *must* act on it to halt — the decision is never hidden. No new `catch` is added; no error is swallowed. A failure to halt-when-required would surface as a wrong `engine.halted` cardinality, which the cardinality-pinned tests catch.

---

## Task 1: Add `recordTerminalFailure` pure helper

### Overview
Create the single source of truth for terminal-failure bookkeeping as a pure, exported function, and move `HaltContext` into the same module.

### Changes Required
**File**: `src/engine/halt-accounting.ts` (new)
**Changes**: Import `FastFailState` from `./iteration-guard.ts`. Export `HaltContext` and `recordTerminalFailure`:

```ts
import type { FastFailState } from "./iteration-guard.ts";

/** Supervisor halt context recorded on each terminal failure. */
export type HaltContext = { issueId: string; failingStep: string | undefined };

export type TerminalFailureResult = {
  consecutiveFailures: number;
  failedCycles: string[];
  lastHaltContext: HaltContext;
  fastFail: FastFailState;
  halt: boolean;
};

/**
 * Pure terminal-failure bookkeeping shared by the commit-failure, fast-bail,
 * and budget-exhausted supervisor branches. Increments the consecutive-failure
 * count, appends the cycle to failedCycles (returns a NEW array — never mutates
 * the input), records lastHaltContext, resets the iteration-too-fast counter,
 * and reports whether the max_consecutive_failures threshold was reached.
 *
 * Side-effect-free: terminalDrain and break/halt control flow stay at the call
 * site. The caller reassigns its loop state from the returned object and acts on
 * `halt`.
 */
export function recordTerminalFailure(
  prev: { consecutiveFailures: number; failedCycles: readonly string[] },
  opts: {
    cycleId: string;
    issueId: string;
    failingStep: string | undefined;
    maxConsecutiveFailures: number;
  },
): TerminalFailureResult {
  const consecutiveFailures = prev.consecutiveFailures + 1;
  const failedCycles = [...prev.failedCycles, opts.cycleId];
  return {
    consecutiveFailures,
    failedCycles,
    lastHaltContext: { issueId: opts.issueId, failingStep: opts.failingStep },
    fastFail: { key: null, count: 0 },
    halt: consecutiveFailures >= opts.maxConsecutiveFailures,
  };
}
```

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run typecheck` clean).
- [ ] `FastFailState` import resolves; no circular-import warning (`iteration-guard.ts` does not import `halt-accounting.ts`).
- [ ] Tests pass (Task 3).
- [ ] Failure paths behave as designed — N/A pure; function has no failure surface and swallows nothing.

---

## Task 2: Route all three terminal-failure branches through the helper

### Overview
Replace the three inline bookkeeping copies in the supervisor loop with calls to `recordTerminalFailure`, keeping `terminalDrain`, the fast-bail `step.warning`, and all halt/break control flow at the call site.

### Changes Required
**File**: `src/cli.ts`
**Changes**:

1. Remove the local `HaltContext` definition at `src/cli.ts:35` and add it to the import. Add to the existing `src/engine/iteration-guard.ts` import group (or a new import line):
   ```ts
   import { recordTerminalFailure, type HaltContext } from "./engine/halt-accounting.ts";
   ```

2. **Commit-failure branch** (`src/cli.ts:530-541`) — replace lines 531-541 (everything after the `await terminalDrain(...)` at 530) with:
   ```ts
   const acct = recordTerminalFailure(
     { consecutiveFailures, failedCycles },
     { cycleId, issueId: row.id, failingStep: "commit", maxConsecutiveFailures },
   );
   consecutiveFailures = acct.consecutiveFailures;
   failedCycles = acct.failedCycles;
   lastHaltContext = acct.lastHaltContext;
   fastFailKey = acct.fastFail.key;
   fastFailCount = acct.fastFail.count;
   if (acct.halt) {
     halted = true;
     haltReason = "max_consecutive_failures";
     activeCycleId = undefined;
     break;
   }
   ```

3. **Fast-bail branch** (`src/cli.ts:579-590`) — leave the preceding `step.warning` emit (572-578) and `await terminalDrain(...)` (579) untouched; replace lines 580-590 with the identical block as above except `failingStep: failingStep` (the resolved variable).

4. **Budget-exhausted branch** (`src/cli.ts:595-606`) — leave `await terminalDrain(...)` (595) untouched; replace lines 596-606 with the identical block using `failingStep: failingStep`.

> Note: `consecutiveFailures`, `failedCycles`, `lastHaltContext`, `fastFailKey`, `fastFailCount` are already `let`/reassignable module variables, so reassignment from `acct` is valid. The `const acct` is block-scoped inside each branch — no name collision across branches.

### Success Criteria
- [ ] `src/cli.ts` no longer contains any inline `consecutiveFailures += 1` / `failedCycles.push(...)` / `fastFailKey = null` sequence inside the three `while`-loop branches — each calls `recordTerminalFailure`.
- [ ] The resume-block copy (439-447), success-path reset (544-551), retry-drain (591-593), and triage halt remain unchanged.
- [ ] `break`, `halted`, `haltReason`, `activeCycleId = undefined`, the fast-bail `step.warning`, and all three `terminalDrain` calls remain at the call site.
- [ ] `npm run typecheck` clean; `npm test` green (existing `tests/cli/halt.test.ts` and `tests/cli/iteration-too-fast.test.ts` pass unchanged).
- [ ] Failure paths behave as designed — `terminalDrain`/`log.emit` rejections still propagate; halt decision surfaced via `acct.halt`, never hidden.

---

## Task 3: Unit tests for `recordTerminalFailure`

### Overview
Add focused, in-memory unit tests pinning the shared bookkeeping behavior so a future divergence is caught.

### Changes Required
**File**: `tests/engine/halt-accounting.test.ts` (new)
**Changes**: Use `node:test` + `node:assert/strict`, mirroring `tests/engine/iteration-guard.test.ts`. Cover:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { recordTerminalFailure } from "../../src/engine/halt-accounting.ts";
```

- **Increment + append-by-one (all three paths identical):** from `{ consecutiveFailures: 0, failedCycles: [] }`, calling with `failingStep: "commit"`, then a resolved step, then another, each increments by exactly one and appends exactly one entry — assert `result.consecutiveFailures === prev + 1` and `result.failedCycles.length === prev.length + 1`.
- **Input not mutated:** pass a frozen `failedCycles` array; assert the input array is unchanged and the returned array is a different reference.
- **`lastHaltContext` field correctness per path:** `failingStep: "commit"` → `{ issueId, failingStep: "commit" }`; resolved step value → `{ issueId, failingStep: "<resolved>" }`; `failingStep: undefined` → `{ issueId, failingStep: undefined }`.
- **fastFail reset:** every result has `fastFail` deep-equal `{ key: null, count: 0 }` regardless of inputs.
- **Halt decision at threshold:** with `maxConsecutiveFailures: 2`, first call from count 0 → `halt === false`; second call from count 1 → `halt === true`.
- **Below-threshold no-halt:** with `maxConsecutiveFailures: 3`, call from count 1 → `consecutiveFailures === 2`, `halt === false`.
- **Threshold 1:** `maxConsecutiveFailures: 1`, call from count 0 → `halt === true`.

### Success Criteria
- [ ] New test file passes under `node:test`.
- [ ] Tests assert per-path bookkeeping deltas, `lastHaltContext` field values, fastFail reset, and the halt boundary at/below threshold.
- [ ] No mocking required (pure function — anti-mock bias satisfied).

---

## Task 4: Coverage floor and docs

### Overview
Lock in the new helper's coverage and add the optional one-line maintainer note.

### Changes Required
**File**: `scripts/coverage-gate.mjs`
**Changes**: Add `src/engine/halt-accounting.ts` to the `FLOORS` table at a 100% line / 100% function floor (the helper is pure and trivially fully covered by Task 3). This mirrors the per-file floors already applied to other pure `src/engine/*` helpers and prevents future untested edits.

**File**: `CLAUDE.md` (Architecture section)
**Changes**: Add one line alongside the existing `src/engine/iteration-guard.ts` supervisor note:
> `src/engine/halt-accounting.ts` — pure `recordTerminalFailure(prev, opts)` used by the `src/cli.ts` supervisor's commit-failure, fast-bail, and budget-exhausted branches: the single source of truth for terminal-failure bookkeeping (increment `consecutiveFailures`, append `failedCycles`, set `lastHaltContext`, reset the fast-fail counter) returning a `{ halt }` decision the caller acts on. `break`/`terminalDrain` stay at the call site.

### Success Criteria
- [ ] `npm run test:coverage` passes; `npm run check:coverage` enforces the new floor and reports no overall coverage decrease.
- [ ] `CLAUDE.md` note added; no command/convention change.
- [ ] No compiler/linter warnings introduced.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `src/cli.ts` contains exactly one implementation of the terminal-failure bookkeeping sequence; the commit-failure, fast-bail, and budget-exhausted branches each invoke it rather than repeating `consecutiveFailures += 1` / `failedCycles.push(...)` / `lastHaltContext = {...}` / `fastFailKey`/`fastFailCount` reset inline. | Task 1, Task 2 | Helper in `src/engine/halt-accounting.ts`; three call sites rewired. |
| [ ] A test asserts that a commit-failure terminal drain, a fast-bail terminal drain, and a budget-exhausted terminal drain each increment `consecutiveFailures` by exactly one and append exactly one entry to `failedCycles`. | Task 3 | Unit test exercises the single helper all three paths route through with each path's inputs. |
| [ ] A test asserts that reaching `max_consecutive_failures` via any of the three terminal-failure paths emits `engine.halted` exactly once (cardinality-pinned via `filter(predicate).length === 1`, not `find`), with `reason: "max_consecutive_failures"` and the correct `threshold` and `failed_cycles`. | Task 2, Task 3 | Helper's halt boundary unit-tested (Task 3); existing cardinality-pinned `engine.halted` integration assertions in `tests/cli/halt.test.ts` (commit/budget) and `tests/cli/iteration-too-fast.test.ts` (fast-bail) still pass unchanged after rewiring (Task 2), confirming exactly-once emission per path. |
| [ ] **Failure-path criterion**: A test asserts that when a terminal failure occurs but `consecutiveFailures` is still below `maxConsecutiveFailures`, the helper reports no-halt, the supervisor does not set `halted`/`haltReason`, no `engine.halted` event is emitted, and the loop continues to the next pending cycle. | Task 3, Task 2 | Below-threshold `halt === false` unit-tested (Task 3); existing below-threshold continue-draining integration coverage in `tests/cli/halt.test.ts` (`fail → success → fail`, retry-drain, blocked-propagation cases) preserved by Task 2. |
| [ ] `lastHaltContext` after each terminal-failure path carries the same `{ issueId, failingStep }` values it did before the refactor (commit path uses `"commit"`; fast-bail and budget-exhausted use the resolved `failingStep`). | Task 2, Task 3 | Call sites pass `"commit"` vs resolved `failingStep` (Task 2); unit test asserts the resulting `lastHaltContext` fields per path (Task 3). |
| [ ] All existing tests still pass. | Task 2 | Pure refactor; `npm test` green. |
| [ ] `npm run typecheck` reports no warnings; `npm run test:coverage` meets the per-file floor for `src/cli/run-one.ts` / `src/cli.ts` paths and overall coverage does not decrease. | Task 2, Task 4 | New `src/engine/halt-accounting.ts` floor added to `FLOORS` (Task 4); aggregate coverage preserved. |
| [ ] No compiler/linter warnings introduced. | Task 1, Task 2, Task 4 | Verified via `npm run typecheck` and the build. |

---

## Testing Strategy

### Unit Tests
- **`tests/engine/halt-accounting.test.ts`** (new, primary): per-path increment/append deltas, `lastHaltContext` field correctness for `"commit"` / resolved-step / `undefined`, fastFail reset to `{ key: null, count: 0 }`, halt boundary at threshold (count reaches `max`), below-threshold no-halt, threshold-1 immediate halt, and input-array immutability.
- **Failure-path test (no-halt continuation):** asserted at the helper level via the below-threshold `halt === false` case; the supervisor-level "does not set `halted`/`haltReason`, no `engine.halted`, loop continues" behavior is covered by the existing `tests/cli/halt.test.ts` below-threshold cases, which remain green after the rewiring (no edit needed — they exercise the rewired call sites end-to-end).
- **Mocking strategy:** none — the helper is pure and tested with real inputs (anti-mock bias). The supervisor-level behavior continues to be covered by the existing subprocess-integration harness in `tests/cli/`, which uses real temp git repos and real `.cycle/log.jsonl` events (no mocking).

### Integration / E2E Tests
- No new integration tests required. The existing cardinality-pinned `engine.halted` assertions in `tests/cli/halt.test.ts` (commit-failure and budget-exhausted halt paths) and `tests/cli/iteration-too-fast.test.ts` (fast-bail path) serve as the end-to-end regression guard: if the rewiring altered any of the five mutated fields, the threshold check, or the exactly-once emission, these tests fail. Run the full suite (`npm test`) to confirm.

## Risk Assessment
- **Behavioral drift from `failedCycles` array-copy semantics**: the original code mutates `failedCycles` in place via `.push`; the helper returns a new array and the caller reassigns. Risk: a stale reference elsewhere observing the old array. Mitigation: `failedCycles` is read only at the post-loop `engine.halted` guard and inside the helper input — no aliasing exists; the reassignment `failedCycles = acct.failedCycles` makes the new array the single live reference. The success-path reset (`failedCycles = []`) already reassigns, confirming reassignment is the established pattern.
- **Accidentally folding the fast-bail `step.warning` or `terminalDrain` into the helper**: would change observability/ordering. Mitigation: Task 2 explicitly leaves both at the call site; success criteria assert all three `terminalDrain` calls and the `step.warning` remain inline.
- **Circular import between `halt-accounting.ts` and `iteration-guard.ts`**: Mitigation: the dependency is one-directional (`halt-accounting` imports only the `FastFailState` *type* from `iteration-guard`; `iteration-guard` imports nothing from `halt-accounting`). Type-only import erases at build time.
- **`HaltContext` move breaks the out-of-scope resume block (`src/cli.ts:439-447`)**: it references `lastHaltContext` typed as `HaltContext`. Mitigation: the type is imported back into `cli.ts`, so the resume block compiles unchanged with no logic edit.
