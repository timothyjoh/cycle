# SPEC — Cycle 0013: Extract triplicated terminal-failure bookkeeping into a shared helper

## Objective
The exec-failure handling in `src/cli.ts` carries three near-verbatim copies of the same terminal-failure bookkeeping sequence (commit-failure, fast-bail, and budget-exhausted blocks). This cycle factors that duplicated accounting into a single helper that all three call sites route through, eliminating the drift hazard where a future change to halt accounting must be applied identically in three places. It is a pure refactor: the halt and failure-counting semantics are preserved exactly, and new focused tests pin the shared behavior so a future divergence is caught.

## Source Issue
`refl-0011-triplicated-terminal-failure-bookkeeping` — "Extract triplicated terminal-failure bookkeeping in cli.ts supervisor loop into a shared helper"

## Scope

### In Scope
- Introduce a single helper that performs the shared terminal-failure bookkeeping (`consecutiveFailures += 1`, `failedCycles.push(...)`, set `lastHaltContext`, reset `fastFailKey`/`fastFailCount`, and evaluate the `max_consecutive_failures` threshold) and returns a halt decision rather than burying loop control flow.
- Route all three terminal-failure call sites in `src/cli.ts` (commit-failure, fast-bail, budget-exhausted) through that helper, with each site inspecting the returned decision to decide whether to set the halt fields and `break`.
- Add focused tests asserting all three failure paths produce identical bookkeeping, including the exactly-once `engine.halted` emission.

### Out of Scope
- Any change to the `terminalDrain` call signature or to `engine.halted` payload contents.
- The success-path counter reset (lines around the `drainSuccess` branch) and the triage-failure accounting — these are not part of the triplicated terminal-failure sequence and are left untouched beyond what is mechanically necessary.
- The iteration-too-fast guard logic itself (`advanceFastFailCounter`) and any change to halt reasons, thresholds, or backoff behavior.

## Requirements
- A single helper encapsulates the terminal-failure bookkeeping currently duplicated across the commit-failure, fast-bail, and budget-exhausted branches.
- Control flow (`break` out of the supervisor `while` loop) remains visible at the call site: the helper returns a decision (e.g. `{ halt: boolean }`) and does not itself `break`, `return`, or otherwise exit the loop. A labeled-loop or sentinel-return shape is acceptable if it reads more cleanly than a returned decision object.
- The mutated supervisor state — `consecutiveFailures`, `failedCycles`, `lastHaltContext` (including its `issueId` and `failingStep` fields), `fastFailKey`, `fastFailCount` — is updated with semantics byte-for-byte equivalent to the current three copies.
- The `max_consecutive_failures` threshold comparison and the setting of `halted`, `haltReason`, and `activeCycleId = undefined` before `break` are preserved exactly across all three sites.
- No behavior change: the engine produces identical events, halt accounting, and exit conditions for every input that previously exercised any of the three branches.
- **Failure behavior**: This is an internal refactor with no new external input surface. The helper must preserve the existing failure-path behavior unchanged — when `consecutiveFailures` reaches `maxConsecutiveFailures`, the supervisor still halts with `haltReason = "max_consecutive_failures"` and emits exactly one `engine.halted` event; when below threshold, it continues draining the queue. The helper must not swallow or alter the terminal-drain side effect (`terminalDrain` is still awaited at each call site before bookkeeping). If a call site needs to halt, that decision is surfaced via the return value and acted on by the caller — never hidden.

## Acceptance Criteria
- [ ] `src/cli.ts` contains exactly one implementation of the terminal-failure bookkeeping sequence; the commit-failure, fast-bail, and budget-exhausted branches each invoke it rather than repeating `consecutiveFailures += 1` / `failedCycles.push(...)` / `lastHaltContext = {...}` / `fastFailKey`/`fastFailCount` reset inline.
- [ ] A test asserts that a commit-failure terminal drain, a fast-bail terminal drain, and a budget-exhausted terminal drain each increment `consecutiveFailures` by exactly one and append exactly one entry to `failedCycles`.
- [ ] A test asserts that reaching `max_consecutive_failures` via any of the three terminal-failure paths emits `engine.halted` exactly once (cardinality-pinned via `filter(predicate).length === 1`, not `find`), with `reason: "max_consecutive_failures"` and the correct `threshold` and `failed_cycles`.
- [ ] **Failure-path criterion**: A test asserts that when a terminal failure occurs but `consecutiveFailures` is still below `maxConsecutiveFailures`, the helper reports no-halt, the supervisor does not set `halted`/`haltReason`, no `engine.halted` event is emitted, and the loop continues to the next pending cycle.
- [ ] `lastHaltContext` after each terminal-failure path carries the same `{ issueId, failingStep }` values it did before the refactor (commit path uses `"commit"`; fast-bail and budget-exhausted use the resolved `failingStep`).
- [ ] All existing tests still pass.
- [ ] `npm run typecheck` reports no warnings; `npm run test:coverage` meets the per-file floor for `src/cli/run-one.ts` / `src/cli.ts` paths and overall coverage does not decrease.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node's built-in `node:test` framework, consistent with the existing supervisor/halt-accounting suites.
- Key scenarios: (1) each of the three terminal-failure paths produces identical bookkeeping deltas; (2) crossing the `max_consecutive_failures` threshold halts with exactly one `engine.halted`; (3) below-threshold terminal failure continues draining without halting; (4) regression — a successful cycle still resets all counters; (5) `lastHaltContext` field correctness per path.
- Reuse `expectExactlyOne` / cardinality-pinned `filter(...).length === 1` assertions for `engine.halted` per the test conventions.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention or command change. If the helper warrants a one-line mention alongside the existing `src/engine/iteration-guard.ts` / supervisor notes, add it; otherwise no update is required.
- **README.md**: No user-facing change — internal refactor only.
- **docs/ENGINE.md**: Optionally note that terminal-failure bookkeeping is centralized in a single helper, if it aids future maintainers; not required for "done".

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `src/cli.ts` supervisor loop and its state variables (`consecutiveFailures`, `failedCycles`, `lastHaltContext`, `fastFailKey`, `fastFailCount`, `halted`, `haltReason`).
- `terminalDrain` from `src/engine/issue-lifecycle.ts` and `advanceFastFailCounter` from `src/engine/iteration-guard.ts` (unchanged).
- No new external services or environment variables.
