# Research: Cycle 0013

## Cycle Context
SPEC.md asks for a pure refactor of `src/cli.ts`: the supervisor `while (!halted)` loop currently carries three near-verbatim copies of the same terminal-failure bookkeeping sequence — the commit-failure branch, the iteration-too-fast fast-bail branch, and the budget-exhausted branch. Each copy performs `consecutiveFailures += 1`, `failedCycles.push(cycleId)`, sets `lastHaltContext = { issueId, failingStep }`, resets `fastFailKey`/`fastFailCount`, and evaluates the `max_consecutive_failures` threshold (setting `halted`, `haltReason`, `activeCycleId = undefined`, then `break`). This cycle factors that duplicated accounting into a single helper that all three sites route through. The helper must return a halt *decision* (e.g. `{ halt: boolean }`) rather than itself `break`/`return` out of the loop — control flow stays visible at the call site. Semantics must be byte-for-byte preserved (no behavior change), and focused tests must pin that all three paths produce identical bookkeeping plus the exactly-once `engine.halted` emission.

## Current Codebase State

### Relevant Components
- Supervisor entry point: `src/cli.ts` — top-level module; runs on import via top-level `await`. There are **no exports** in this file; argv parsing, lock acquisition, and the supervisor loop all execute as module side effects, ending in `process.exit(...)`.
- Supervisor state variables (declared together): `src/cli.ts:208-224` — `cyclesProcessed`, `consecutiveFailures`, `failedCycles`, `halted`, `haltReason`, `lastHaltContext`, `maxConsecutiveFailures`, plus the iteration-guard counters `fastFailKey`, `fastFailCount` and the constant `ITERATION_TOO_FAST_K = 2`.
- `HaltContext` type: `src/cli.ts:35` — `{ issueId: string; failingStep: string | undefined }`.
- The main supervisor loop: `src/cli.ts:453-610` (`while (!halted)`).
- `engine.halted` emission (single, after the loop): `src/cli.ts:612-618` — guarded by `halted && haltReason === "max_consecutive_failures" && failedCycles.length > 0`.
- `engine.stop` emission + `process.exit`: `src/cli.ts:620-629`.

### The three terminal-failure copies (in scope)
1. **Commit-failure branch** — `src/cli.ts:529-542`:
   ```
   await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, "commit", row.attempt + 1);
   consecutiveFailures += 1;
   failedCycles.push(cycleId);
   lastHaltContext = { issueId: row.id, failingStep: "commit" };
   fastFailKey = null;
   fastFailCount = 0;
   if (consecutiveFailures >= maxConsecutiveFailures) {
     halted = true;
     haltReason = "max_consecutive_failures";
     activeCycleId = undefined;
     break;
   }
   ```
   `failingStep` is the literal `"commit"`.
2. **Fast-bail (iteration-too-fast) branch** — `src/cli.ts:571-590`: identical bookkeeping, preceded by a `step.warning { reason: "iteration_too_fast", ... }` emit (`src/cli.ts:572-578`); `failingStep` is the resolved `failingStep` variable.
3. **Budget-exhausted branch** — `src/cli.ts:594-607`: identical bookkeeping; `failingStep` is the resolved `failingStep` variable.

All three call `terminalDrain(...)` immediately *before* the bookkeeping. The five mutated fields and the threshold check are byte-for-byte identical across the three; the only per-site differences are (a) the `terminalDrain` `failingStep` argument and the `lastHaltContext.failingStep` value (`"commit"` vs the resolved `failingStep`) and (b) the fast-bail site’s preceding `step.warning` emit.

### Out-of-scope near-copy (do NOT touch)
- Resume terminal branch — `src/cli.ts:439-447` (inside the `if (cfg) { … }` resume block, not the `while` loop). This copy increments `consecutiveFailures`, pushes to `failedCycles`, sets `lastHaltContext`, and checks the threshold, but **does not** reset `fastFailKey`/`fastFailCount`, does not set `activeCycleId = undefined` inline, and does not `break` (it falls through to `activeCycleId = undefined` at `src/cli.ts:448`). SPEC explicitly scopes the work to the three branches inside the `while` loop; this resume copy is not part of the "triplicated" set.

### Success-path counter reset (out of scope, leave untouched)
- `src/cli.ts:544-551` — the `drainSuccess` branch resets `consecutiveFailures = 0`, `failedCycles = []`, `lastHaltContext = undefined`, `fastFailKey = null`, `fastFailCount = 0`. SPEC excludes this from the refactor.
- Retry-drain branch — `src/cli.ts:591-593` — leaves the counter unchanged (no bookkeeping); not part of the terminal sequence.

### Existing Patterns to Follow
- **Pure-helper-in-separate-module pattern (for unit testability):** `src/engine/iteration-guard.ts` extracts the supervisor’s fast-fail transition as a pure function `advanceFastFailCounter(prev, opts): { state, fastBail }` (`src/engine/iteration-guard.ts:73-94`) and is unit-tested directly in `tests/engine/iteration-guard.test.ts`. Because `src/cli.ts` runs top-level code on import and has no exports, the existing precedent for unit-testing supervisor logic is to host the pure logic in an importable `src/engine/*.ts` module and import the helper into `cli.ts`. Other examples: `src/engine/engine-lock.ts`, `src/engine/child-env.ts`.
- **Decision-returning helper, control flow at the call site:** `advanceFastFailCounter` returns `{ state, fastBail }` and the `cli.ts` caller (`src/cli.ts:556-569`) inspects `advanced.fastBail` to decide branching — it never controls the loop itself. SPEC requires the new helper to follow this exact shape (return `{ halt }`; the caller does the `break`).
- **Failure handling (existing approach):** terminal failures route through `terminalDrain` (`src/engine/issue-lifecycle.ts:9-…`), which stamps `failed_at`/`failed_step`/`failed_attempts`/`last_cycle_id` frontmatter, moves the issue to `failedDir`, and propagates blocked dependents. `terminalDrain` is awaited at each call site *before* bookkeeping; SPEC requires this ordering be preserved and the side effect not be folded into the helper. Retry (non-terminal) failures route through `drainRetry` (`src/cli.ts:243-253`) and leave counters unchanged.
- **Observability conventions:** structured JSON events via the logger created at `src/cli.ts:156` (`createLogger`), emitted with `await log.emit(eventName, payload)`. Relevant events in the change area: `step.warning` (`src/cli.ts:572`), `engine.halted` (`src/cli.ts:613`), `engine.stop` (`src/cli.ts:620`), `queue.drained`/`issue.failed` (emitted inside `drainRetry`/`drainSuccess`). The `engine.halted` event carries `{ failed_cycles, reason, threshold }`. SPEC forbids changing the `engine.halted` payload or `terminalDrain` signature.
- **Idempotency / retry-safety:** single-engine exclusion via PID lockfile `acquireLock`/`releaseLock` (`src/cli.ts:145-152`, `src/engine/engine-lock.ts`); released on `process.on("exit")`. The fast-fail counter is keyed `${cycleId}::${failingStep ?? ""}` (`src/cli.ts:555`) and persists across an issue’s retries within the single long-running process. Counters (`consecutiveFailures`, `fastFailKey`, `fastFailCount`) are in-process module state, not persisted. SPEC requires these reset/threshold semantics be preserved exactly.
- **Module-load env override:** `--trunk` / `.cycle/.env` sets `CYCLE_TRUNK_BASED` before `loadConfig` (`src/cli.ts:176-178`); not in the change area but affects subprocess env (`spawnRunOne`, `src/cli.ts:266-293`).

### Dependencies & Integration Points
- `terminalDrain` — `src/engine/issue-lifecycle.ts:9` (imported at `src/cli.ts:26`). Signature: `(cwd, log, todoPath, failedDir, cycleId, issueId, failingStep, failedAttempts)`. SPEC: signature must not change.
- `advanceFastFailCounter`, `readCycleEndFailure` — `src/engine/iteration-guard.ts` (imported at `src/cli.ts:27`). The guard logic itself is out of scope.
- `Logger` type — `src/engine/log.ts` (imported at `src/cli.ts:32`). A helper that emits events or accepts state would receive `log` and the mutable supervisor state.
- `CycleConfig`/`loadConfig` — `src/engine/workflow.ts`. `maxConsecutiveFailures` derives from `cfg?.engine?.max_consecutive_failures ?? 2` (`src/cli.ts:214`).
- Queue drains — `drainOk`/`drainFailedRetry` via `src/engine/queue.ts`, wrapped by `drainSuccess`/`drainRetry` local helpers (`src/cli.ts:226-253`).

### Test Infrastructure
- **Framework:** Node’s built-in `node:test` with `node:assert` (`strict`). Run via `npm test` (auto-builds `dist/cycle.js` via `pretest`), coverage via `npm run test:coverage`.
- **Supervisor/halt tests are subprocess integration tests, not unit tests.** `tests/cli/halt.test.ts` bootstraps a temp git repo (`bootstrapRepo`, lines 17-42), seeds queue rows + todo files (`seedTodo`, lines 45-70), writes a `workflows.yml` (`workflowYml`, lines 72-91) and a `verify.sh` that exits 1 for selected issue IDs (`verifyScript`, lines 94-102), then runs the built CLI with `spawnSync("node", [dist, "run"], …)` and asserts on `.cycle/log.jsonl` events (`readEvents`, lines 104-107). The same harness shape appears in `tests/cli/iteration-too-fast.test.ts` and `tests/cli/queue-drain.test.ts`.
- **Unit-test precedent for extracted pure helpers:** `tests/engine/iteration-guard.test.ts` imports the helper directly and asserts on return values + state transitions (in-memory, with a tiny temp-log helper for `readCycleEndFailure`). This is the model a new pure halt-accounting helper would follow if hosted in `src/engine/`.
- **Cardinality-pinning convention (required by SPEC + CLAUDE.md):** exactly-once engine events must be asserted with `filter(predicate).length === 1`, never bare `find`. Use the `expectExactlyOne(events, eventName)` helper from `tests/helpers.ts` (imported at `tests/cli/halt.test.ts:7`); it asserts `length === 1` and returns the matched event. `engine.halted` is a canonical exactly-once event (used at `tests/cli/halt.test.ts:123, 190`).
- **Existing halt failure-path coverage (the change area):**
  - Two consecutive terminal failures → exactly one `engine.halted`, `threshold`/`failed_cycles` checked, third cycle not popped: `tests/cli/halt.test.ts:109-142`.
  - fail → success → fail resets counter, no halt, stale `halted_at_issue`/`failing_step` cleared: `tests/cli/halt.test.ts:144-176`.
  - threshold 1 halts after one terminal failure: `tests/cli/halt.test.ts:178-201`.
  - retry-drain does not increment counter, engine continues: `tests/cli/halt.test.ts:203-237`.
  - blocked-propagation under threshold (no halt): `tests/cli/halt.test.ts:239-310`.
  - iteration-too-fast fast-bail behavior: `tests/cli/iteration-too-fast.test.ts`.
  - Pure fast-fail transition unit tests: `tests/engine/iteration-guard.test.ts`.
- **Coverage floors:** `src/cli.ts` is **not** listed in the `FLOORS` table (`scripts/coverage-gate.mjs:12-…`). Floors that exist for adjacent files: `src/cli/run-one.ts` 70%, `src/engine/issue-lifecycle.ts` 95%, `src/engine/run-cycle.ts` 90%. Per CLAUDE.md, overall coverage must not decrease (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%). A new `src/engine/*.ts` helper would be subject to the aggregate floors; if the planner adds it to `FLOORS`, the gate enforces a per-file floor.
- **`node:fs/promises` mocking caveat (CLAUDE.md):** ESM module properties are non-configurable; `mock.method` on `node:fs/promises` throws. Use `node:fs` for `mock.method`, or real filesystem manipulation. Relevant only if the planner stubs filesystem calls; the subprocess-integration approach used by `halt.test.ts` avoids mocking entirely.
- **Structural invariants:** `scripts/structural-invariants.mjs` already has a `src/cli.ts` rule (`pattern: /commit-scope-guard-loop/g, expected: 0`, lines 25-30). Any new invariant for "exactly one terminal-failure bookkeeping implementation" would be registered in the `INVARIANTS` table there (CLAUDE.md: that table is the single source of truth).

## Code References
- `src/cli.ts:208-224` — supervisor state variable declarations (`consecutiveFailures`, `failedCycles`, `halted`, `haltReason`, `lastHaltContext`, `maxConsecutiveFailures`, `fastFailKey`, `fastFailCount`, `ITERATION_TOO_FAST_K`).
- `src/cli.ts:35` — `HaltContext` type.
- `src/cli.ts:439-447` — resume-block terminal copy (OUT OF SCOPE: no fast-fail reset, no inline break).
- `src/cli.ts:453-610` — supervisor `while (!halted)` loop.
- `src/cli.ts:529-542` — commit-failure terminal bookkeeping copy #1 (`failingStep = "commit"`).
- `src/cli.ts:544-551` — success-path counter reset (OUT OF SCOPE).
- `src/cli.ts:571-590` — fast-bail terminal bookkeeping copy #2 (preceded by `step.warning`).
- `src/cli.ts:591-593` — retry-drain (no bookkeeping; OUT OF SCOPE).
- `src/cli.ts:594-607` — budget-exhausted terminal bookkeeping copy #3.
- `src/cli.ts:612-618` — single `engine.halted` emission after the loop.
- `src/cli.ts:620-629` — `engine.stop` + `process.exit`.
- `src/engine/iteration-guard.ts:73-94` — `advanceFastFailCounter` pure-helper / decision-return pattern to mirror.
- `src/engine/issue-lifecycle.ts:9-18` — `terminalDrain` signature (must not change).
- `tests/cli/halt.test.ts:104-142` — `readEvents` + canonical halt-accounting integration test.
- `tests/helpers.ts` — `expectExactlyOne` helper for cardinality-pinned assertions.
- `scripts/coverage-gate.mjs:12-31` — `FLOORS` table (no `src/cli.ts` entry).
- `scripts/structural-invariants.mjs:25-30` — existing `src/cli.ts` structural invariant.

## Open Questions
- **Helper location:** SPEC names "a single helper" but does not specify the module. The two consistent precedents are (a) a non-exported local function inside `src/cli.ts` (testable only via subprocess integration like the existing `halt.test.ts`), or (b) a pure exported helper in `src/engine/` (e.g. `halt-accounting.ts`), unit-testable directly like `src/engine/iteration-guard.ts`. SPEC’s acceptance criteria call for focused tests asserting bookkeeping deltas — which is far easier against an exported pure function — but do not mandate a module. The planner must choose; this affects whether new unit tests are possible without subprocess spawning.
- **State-mutation shape:** because the bookkeeping mutates six pieces of in-loop `let` state (`consecutiveFailures`, `failedCycles`, `lastHaltContext`, `fastFailKey`, `fastFailCount`, and reads `maxConsecutiveFailures`), a pure helper would need to take/return a state object (e.g. `{ consecutiveFailures, failedCycles, lastHaltContext, fastFail }`) and the caller re-assigns the loop variables, or the helper takes a mutable context object. SPEC allows "a returned decision object" but leaves the state-threading mechanism to the planner.
- **Whether to also fold the inline `break`/`activeCycleId = undefined`:** SPEC requires the `break` and the setting of `halted`/`haltReason`/`activeCycleId = undefined` to remain *visible at the call site* and not be hidden in the helper. The exact boundary — whether the helper sets `halted`/`haltReason` and only the `break`+`activeCycleId` stay at the call site, or whether the helper only returns `{ halt }` and the caller sets all three — is a planner decision constrained by "control flow stays at the call site."
- **`FLOORS`/invariant registration:** SPEC marks CLAUDE.md/docs updates optional. Whether the new helper module is added to `scripts/coverage-gate.mjs` FLOORS and/or a "single implementation" rule added to `scripts/structural-invariants.mjs` (to lock in the de-duplication) is unresolved; both are the documented extension points if the planner wants enforcement.
