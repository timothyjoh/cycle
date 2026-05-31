# Implementation Plan: Cycle 0011

## Overview
Add a rate-based "iteration-too-fast" guard on top of the existing count-based retry budget: `runCycle` measures and emits each step's wall-clock `duration_ms` on `step.end`, and the `src/cli.ts` supervisor fast-bails a cycle to `terminalDrain` after `K=2` consecutive sub-`min_step_duration_ms` failures of the same step, emitting a single `step.warning { reason: "iteration_too_fast" }`.

## Current State (from Research)
- `EngineConfig` (`src/engine/workflow.ts:28-37`) holds numeric engine keys (`rate_limit_backoff_ms`, `step_timeout_ms`) consumed at use sites with `?? <default>`; `loadConfig` does no numeric validation/coercion beyond `commit`.
- Shipped defaults `src/defaults/workflows.yml:3-10` and synced `.cycle/workflows.yml` must stay byte-identical post-`npm run sync-defaults`.
- `runCycle` has a single `step.end` emission site (`src/engine/run-cycle.ts:489-497`) plus a `skip_unless`-miss `step.end` (`:311-317`). There is **no** wall-clock measurement today. `RunCycleOpts` already exposes a `sleepFn` injection seam (`:232`, defaulted `:275`) — the SPEC directs adding the duration/clock source the same way.
- Agent and bash dispatch share the `while (true)` block (`:367-399`); the `step.end` at `:489` runs for both branches, so one addition covers all steps.
- Supervisor: module-level `consecutiveFailures` (`src/cli.ts:208`), `maxConsecutiveFailures` (`:213`); exec-failure retry branch `:553-555`, terminal branch `:556-567`; `readCycleEndFailingStep` (`:284-307`) reads the log tail bottom-up for the failing step. `terminalDrain` is the existing terminal path and increments `consecutiveFailures`.
- Named-constant pattern: `SPEC_MIN_BYTES`, `MAX_STEP_END_STDERR` (`src/engine/run-cycle.ts:175,177`).
- Tests: `node:test` + real temp dirs; `sleepFn: noopSleep` injection (`tests/engine/rate-limit-integration.test.ts`); supervisor-level tests spawn `dist/cycle.js` (`tests/cli/halt.test.ts`); `expectExactlyOne` / `filter(...).length === 1` cardinality pinning.

## Desired End State
- `engine.min_step_duration_ms: 2000` present in `EngineConfig`, `src/defaults/workflows.yml`, and (after `npm run sync-defaults`) `.cycle/workflows.yml` with zero diff.
- Every `step.end` event from `runCycle` carries an integer `duration_ms ≥ 0`.
- The supervisor fast-bails after `K=2` consecutive same-step sub-threshold failures, emitting exactly one `iteration_too_fast` `step.warning` and terminal-draining without a further retry; slow/legitimate failures, disabled guard (`0`/absent/malformed), unreadable duration, and successful cycles behave exactly as today.
- Verify: `npm test`, `npm run typecheck`, `npm run test:coverage` (run-cycle.ts ≥ 90%), and `git diff --quiet .cycle/workflows.yml` after sync.

## What We're NOT Doing
- No change to the rate-limit retry loop in `run-cycle.ts` (`:367-399`).
- No new `engine.halted { reason: "iteration_too_fast" }` union member — the bailed cycle routes through existing `terminalDrain` and counts toward `max_consecutive_failures` like any terminal failure.
- No guard on the commit-failure retry branch (`src/cli.ts:531-545`) or the resume retry path (`runResumeOnce`, `:309-441`).
- No per-workflow / per-step `min_step_duration_ms` overrides.
- No numeric validation added to `loadConfig` — default/disable semantics live at the read site, matching existing engine-key convention.
- No UI/E2E surface; no change to child exit-channel plumbing (`spawnRunOne`).

## Implementation Approach
Three coordinated changes, sliced so each is independently testable:

1. **Config surface (Task 1)** — add the key to the type and shipped/synced YAML. Pure declaration; default/disable resolution happens at the supervisor read site.
2. **Duration emission (Task 2)** — extend `RunCycleOpts` with an injectable `nowFn: () => number` (mirroring `sleepFn`), capture a per-step start at the top of the step loop, and add `duration_ms` to both `step.end` emission sites. This is self-contained in `run-cycle.ts` and verifiable without the supervisor.
3. **Supervisor guard (Task 3)** — extend the existing log-tail read to also return the failing step's `duration_ms`, add a module-level consecutive-fast-failure counter keyed by `${cycleId}::${failingStep}`, and insert the fast-bail decision into the exec-failure branch. Reset wiring threads through the success branch and every terminal drain.

The supervisor obtains `duration_ms` from the log tail (resolving RESEARCH open question 1): `runCycle` runs inside the spawned `run-one.ts` child, so the parent reads the failing step's `step.end.duration_ms` from `.cycle/log.jsonl` in the same bottom-up pass that already finds `failing_step` (generalizing `readCycleEndFailingStep`). `threshold_ms` in the warning = the resolved `min_step_duration_ms` (resolving open question 2). The counter is a single module-level pair `(fastFailKey, fastFailCount)` (resolving open question 3); the single long-running supervisor process persists it across an issue's retries exactly like `consecutiveFailures`.

## Failure & Resilience Decisions

**Task 1 (config type + YAML):** N/A — pure declaration. No runtime read added here; `sync-defaults` correctness is verified by the byte-identical acceptance check.

**Task 2 (duration measurement + `step.end` emission, `run-cycle.ts`):**
- *Failure modes*: `nowFn()` is `Date.now` by default — non-throwing. Duration is clamped `Math.max(0, Math.round(end - start))` so a non-monotonic or injected clock can never yield a negative or fractional value. No I/O is added beyond the already-present `log.emit`.
- *Idempotency*: measurement is per-step in-memory state recomputed on every (re)run of the loop; emitting `step.end` is already the engine's per-step terminal event. A step retry / cycle restart simply remeasures from a fresh `stepStart`. No persisted state mutated by the measurement itself.
- *Observability*: `duration_ms` is now part of every `step.end` line in `.cycle/log.jsonl`, making per-step wall-clock diagnosable directly from the log.
- *No silent failure*: the duration computation cannot swallow an error (pure arithmetic on `nowFn()` results); it does not wrap or suppress the existing step-execution error paths.

**Task 3 (supervisor guard + log-tail read, `cli.ts`):**
- *Failure modes*: the generalized log reader keeps the existing `try/catch` that degrades a missing/unreadable `.cycle/log.jsonl` to `undefined` (today's behavior). If `duration_ms` is absent or non-numeric on the failing `step.end`, the reader returns `durationMs: undefined`; the guard then treats the attempt as **not** sub-threshold (counter does not advance — it resets to zero, the same bucket as an at-or-above-threshold failure), so an unreadable signal degrades to normal count-based retry rather than a spurious fast-bail. A malformed/absent/`0`/negative/non-finite `min_step_duration_ms` resolves to "guard disabled": the threshold check is skipped entirely, the counter is held at zero, and retry behavior is byte-for-byte identical to today; the supervisor never throws on a bad config value (`Number.isFinite` + `> 0` gate at the read site).
- *Idempotency*: the counter is in-memory only and re-derived from the same `(cycleId, failingStep)` log facts on each loop iteration; it is reset on every terminal drain (fast-bail or budget-exhausted), every success, and whenever the failing step differs or the failure is not sub-threshold. A fast-bail issues `terminalDrain` (the same idempotent issue→`failed/` move used today) and never issues a `drainRetry` for that cycle, so no retry row is left behind. Re-running the supervisor after a crash re-reads queue state; the counter starting at zero only makes the guard more conservative (never spuriously bails).
- *Observability*: every retry-suppressing decision emits exactly one `step.warning { cycle_id, step, reason: "iteration_too_fast", duration_ms, threshold_ms }` before `terminalDrain`. The subsequent `queue.drained`/`issue.failed`/`engine.halted` events are unchanged, so the terminal sequence remains diagnosable.
- *No silent failure*: the guard never terminates a cycle without first emitting the `iteration_too_fast` warning. The only swallowed error is the pre-existing log-read `catch`, which is intentional degrade-to-normal-retry behavior (surfaced indirectly: a missing log → normal retry, not a bail).

---

## Task 1: Add `engine.min_step_duration_ms` config key

### Overview
Declare the new key in the `EngineConfig` type and the shipped default config, then re-sync so the runtime config matches.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**: Add the optional field to `EngineConfig` (after `step_timeout_ms`), following the existing doc-comment convention:
```ts
  /** Per-step wall-clock timeout (ms); 0/undefined disables. Guards against a
   * step subprocess that completes its work but never exits (claude -p exit hang). */
  step_timeout_ms?: number;
  /** Minimum acceptable step wall-clock (ms) before the iteration-too-fast
   * guard counts a failure as "instant". Default 2000; 0/absent/malformed
   * disables the guard (never fast-bails). Resolved at the supervisor read site. */
  min_step_duration_ms?: number;
```
No change to `loadConfig` — the key is read off `parsed.engine` like the other numeric keys, with default/disable resolution at the supervisor (Task 3).

**File**: `src/defaults/workflows.yml`
**Changes**: Add `min_step_duration_ms: 2000` to the `engine:` block (after `step_timeout_ms: 2700000`):
```yaml
engine:
  max_consecutive_failures: 2
  base_branch: master
  rate_limit_backoff_ms: 3600000
  step_timeout_ms: 2700000
  min_step_duration_ms: 2000
  commit:
    mode: worktree-pr
    push: true
```

**File**: `.cycle/workflows.yml` (generated)
**Changes**: Run `npm run sync-defaults`; the synced file gains the same key. Do not hand-edit.

### Success Criteria
- [ ] `npm run typecheck` clean with the new field.
- [ ] `npm run sync-defaults` then `git diff --quiet .cycle/workflows.yml` (byte-identical to synced default).
- [ ] `.cycle/workflows.yml` engine block contains `min_step_duration_ms: 2000`.
- [ ] Failure paths behave as designed: N/A — pure declaration (no runtime read added here).

---

## Task 2: Measure and emit per-step `duration_ms` on `step.end`

### Overview
Add an injectable monotonic-ish clock to `RunCycleOpts`, capture a per-step start at the top of the step loop, and include an integer `duration_ms ≥ 0` on every `step.end` emission (both the `skip_unless`-miss emission and the main one — covering agent and bash steps).

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**:
1. Extend `RunCycleOpts` (after `sleepFn`, `:232`):
   ```ts
   nowFn?: () => number;
   ```
2. Default it alongside `sleepFn` (near `:275`):
   ```ts
   const nowFn = opts.nowFn ?? (() => Date.now());
   ```
3. At the top of the step loop body (`:282`, after `const step = wf.steps[i];`):
   ```ts
   const stepStart = nowFn();
   ```
   Defining it at loop top ensures every `step.end` path (including the early `skip_unless` continue) has a start reference.
4. Add a small helper inline or compute at each emission:
   ```ts
   const durationMs = Math.max(0, Math.round(nowFn() - stepStart));
   ```
5. Add `duration_ms` to the `skip_unless`-miss `step.end` (`:311-317`) and the main `step.end` (`:489-497`):
   ```ts
   await log.emit("step.end", {
     cycle_id: cycleId,
     step: step.name,
     status: r.status,
     exit_code: r.exitCode,
     duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
     ...(r.status === "failed"
       ? { stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR) }
       : {}),
   });
   ```
   The measurement window for the main emission spans the `while (true)` exec loop (`:367-399`, including any in-process rate-limit backoff — SPEC permits this) plus the artifact/proof work, reflecting real wall-clock.

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] Every `step.end` emitted by `runCycle` (agent, bash, and `skip_unless`-miss) includes integer `duration_ms ≥ 0`.
- [ ] Existing `step.end` payload tests (`tests/engine/run-cycle.step-end-stderr.test.ts`, `.step-end-stderr-dispatch.test.ts`) still pass; updated to assert `duration_ms`.
- [ ] Deterministic-clock test: injecting `nowFn` returning controlled increments yields the expected integer `duration_ms`.
- [ ] Failure paths behave as designed: duration arithmetic is clamped/rounded, never negative or fractional; no error swallowed.

---

## Task 3: Supervisor iteration-too-fast guard + fast-bail

### Overview
Generalize the supervisor's log-tail read to also return the failing step's `duration_ms`, add a module-level consecutive-fast-failure counter, and insert the fast-bail decision into the exec-failure retry branch, routing through `terminalDrain` with a single `iteration_too_fast` `step.warning`.

### Changes Required
**File**: `src/cli.ts`
**Changes**:
1. Add the named threshold constant near the top-level supervisor constants:
   ```ts
   const ITERATION_TOO_FAST_K = 2;
   ```
2. Add module-level counter state beside `consecutiveFailures` (`:208`):
   ```ts
   let fastFailKey: string | null = null;
   let fastFailCount = 0;
   ```
3. Generalize `readCycleEndFailingStep` (`:284-307`) into a reader that returns both fields in one bottom-up pass — find the failing `cycle.end` (for `failing_step`), then continue scanning upward for that step's `step.end` to read `duration_ms`:
   ```ts
   async function readCycleEndFailure(
     repoRoot: string,
     cycleId: string,
   ): Promise<{ failingStep: string | undefined; durationMs: number | undefined }> {
     // bottom-up: locate cycle.end failed → failing_step, then the matching
     // step.end (same cycle_id + step) for its duration_ms. Missing/non-numeric
     // duration_ms ⇒ undefined. Existing try/catch degrades read errors to undefined.
   }
   ```
   Keep the existing `try/catch` so an unreadable/missing log returns `{ failingStep: undefined, durationMs: undefined }`. `durationMs` is `undefined` unless the matched `step.end.duration_ms` is a finite number.
4. Replace the `failingStep` read at `:516-518` with the new reader:
   ```ts
   const failure = exitCode !== 0
     ? await readCycleEndFailure(cwd, cycleId)
     : { failingStep: undefined, durationMs: undefined };
   const failingStep = failure.failingStep;
   ```
5. Resolve the threshold at the read site (default/disable semantics — never crash):
   ```ts
   const rawMin = cfg?.engine?.min_step_duration_ms;
   const thresholdMs =
     typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0;
   const guardEnabled = thresholdMs > 0;
   ```
6. Rewrite the exec-failure branch (`:553-567`) to interpose the fast-bail decision:
   ```ts
   } else {
     // exec failure (exitCode !== 0)
     const key = `${cycleId}::${failingStep ?? ""}`;
     let fastBail = false;
     if (
       guardEnabled &&
       failingStep !== undefined &&
       typeof failure.durationMs === "number" &&
       failure.durationMs < thresholdMs
     ) {
       if (key === fastFailKey) fastFailCount += 1;
       else { fastFailKey = key; fastFailCount = 1; }
       if (fastFailCount >= ITERATION_TOO_FAST_K) fastBail = true;
     } else {
       // ≥-threshold, unreadable duration, different step, or guard disabled:
       // degrade to normal retry — reset the counter.
       fastFailKey = null;
       fastFailCount = 0;
     }

     if (fastBail) {
       await log.emit("step.warning", {
         cycle_id: cycleId,
         step: failingStep,
         reason: "iteration_too_fast",
         duration_ms: failure.durationMs,
         threshold_ms: thresholdMs,
       });
       await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, failingStep, row.attempt + 1);
       consecutiveFailures += 1;
       failedCycles.push(cycleId);
       lastHaltContext = { issueId: row.id, failingStep };
       fastFailKey = null;
       fastFailCount = 0;
       if (consecutiveFailures >= maxConsecutiveFailures) {
         halted = true;
         haltReason = "max_consecutive_failures";
         activeCycleId = undefined;
         break;
       }
     } else if (row.attempt + 1 < maxAttempts) {
       await drainRetry(cwd, log, cycleId, row.id, failingStep);
     } else {
       await terminalDrain(cwd, log, todoPath, failedDir, cycleId, row.id, failingStep, row.attempt + 1);
       consecutiveFailures += 1;
       failedCycles.push(cycleId);
       lastHaltContext = { issueId: row.id, failingStep };
       fastFailKey = null;
       fastFailCount = 0;
       if (consecutiveFailures >= maxConsecutiveFailures) {
         halted = true;
         haltReason = "max_consecutive_failures";
         activeCycleId = undefined;
         break;
       }
     }
   }
   ```
7. Reset the counter on success (in the `drainSuccess` branch, beside `consecutiveFailures = 0;` at `:549`):
   ```ts
   fastFailKey = null;
   fastFailCount = 0;
   ```
8. Reset the counter in the commit-failure terminal branch (`:535-538`) for symmetry (a terminal drain resets regardless of source):
   ```ts
   fastFailKey = null;
   fastFailCount = 0;
   ```
   (The commit-failure path is otherwise out of scope; this is a counter-hygiene reset on terminal drain, satisfying the SPEC reset-on-terminal-drain rule.)

### Success Criteria
- [ ] `npm run typecheck` clean; `npm test` passes.
- [ ] `K=2` consecutive same-step sub-threshold failures ⇒ exactly one `iteration_too_fast` `step.warning` (cardinality-pinned) and a `terminalDrain` with no further `drainRetry`/`cycle.start` for that issue.
- [ ] A failure with `duration_ms ≥ threshold` retries to `max_cycle_attempts` with no warning.
- [ ] `min_step_duration_ms` `0`/absent/malformed ⇒ guard disabled, no warning, supervisor does not throw, normal budget consumed.
- [ ] A successful cycle resets the counter; no warning.
- [ ] Failure paths behave as designed: unreadable `duration_ms` and bad config degrade to normal retry; every suppressing decision emits the warning first (no silent termination).

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] `engine.min_step_duration_ms` exists in `EngineConfig` (`src/engine/workflow.ts`), is present in `src/defaults/workflows.yml` with value `2000`, and `npm run sync-defaults` leaves `.cycle/workflows.yml` byte-identical to the synced default (no diff). | Task 1 | |
| [ ] Every `step.end` event emitted by `runCycle` includes an integer `duration_ms ≥ 0` field. | Task 2 | Both `step.end` sites (main + `skip_unless`-miss). |
| [ ] Given `K` (default 2) consecutive failures of the same step each with `duration_ms < min_step_duration_ms`, the supervisor emits exactly one `step.warning { reason: "iteration_too_fast", duration_ms }` for that cycle and performs `terminalDrain` without issuing a further `drainRetry` — verified by asserting no additional `cycle.start`/retry for that issue after the bail. | Task 3 | |
| [ ] A step that fails with `duration_ms ≥ min_step_duration_ms` is retried normally up to `max_cycle_attempts`, and no `iteration_too_fast` warning is emitted (slow legitimate failure unaffected). | Task 3 | Counter reset on ≥-threshold failure. |
| [ ] Failure-path criterion: when `engine.min_step_duration_ms` is `0` (or absent/malformed), the guard is disabled — repeated instant failures still consume the full attempt budget and no `iteration_too_fast` warning is emitted; the supervisor does not throw. | Task 3 | `guardEnabled` gate via `Number.isFinite && > 0`. |
| [ ] A cycle that succeeds is unaffected: no `iteration_too_fast` warning, and the consecutive-fast-failure counter is reset. | Task 3 | Reset in `drainSuccess` branch. |
| [ ] All existing tests still pass (`npm test`). | Tasks 1–3 | Verified at cycle end. |
| [ ] `npm run typecheck` is clean and no compiler/linter warnings are introduced; coverage holds at or above the configured floors (`src/engine/run-cycle.ts` ≥ 90%). | Tasks 1–3 | run-cycle.ts duration branch covered by deterministic-clock tests; `cli.ts` has no per-file floor. |

---

## Testing Strategy

### Unit Tests
- **`run-cycle` duration emission** (`tests/engine/run-cycle.step-end-duration.test.ts`, new; extend existing `step-end-stderr` tests):
  - Inject `nowFn` returning a controlled sequence; assert each `step.end` carries integer `duration_ms ≥ 0` matching the injected delta.
  - Assert `duration_ms` present for both a bash step and an agent step (dispatch coverage).
  - Edge: a non-monotonic injected `nowFn` (end < start) yields `duration_ms === 0` (clamp), never negative.
- **Supervisor guard** (`tests/cli/iteration-too-fast.test.ts`, new; harness from `tests/cli/halt.test.ts`):
  - *Fast-fail bail*: bootstrap a temp repo with a fast-failing step (fake agent shell script exiting 1 immediately) and a small `min_step_duration_ms`; run built `dist/cycle.js`; parse `.cycle/log.jsonl`; assert exactly one `iteration_too_fast` `step.warning` (`filter(e => e.event === "step.warning" && e.reason === "iteration_too_fast").length === 1`) and that no `cycle.start` for the issue follows the warning (no further retry). Assert the issue lands in `docs/cycle/issues/failed/`.
  - *Slow legitimate failure*: a step that sleeps past the threshold then fails; assert it retries to `max_cycle_attempts` and emits **no** `iteration_too_fast` warning.
  - *Counter reset (different step / ≥-threshold)*: a sub-threshold failure of step A followed by a failure of step B (or an above-threshold failure of A) does not reach `K`; assert no warning until two same-step sub-threshold failures accumulate.
  - *Guard disabled*: `min_step_duration_ms: 0` and a malformed value (e.g. `"abc"` / negative) — repeated instant failures consume the full budget, no warning, supervisor exits without throwing.
  - *Success reset*: an instant failure (count 1) followed by a successful cycle, then later instant failures, requires a fresh `K` accumulation (counter reset on success).
- **Failure-path tests** (mapped to named failure modes):
  - Unreadable `duration_ms`: emit a `step.end` lacking `duration_ms` (or non-numeric); assert the guard degrades to normal count-based retry (no spurious bail) and no throw.
  - Malformed config: covered by *Guard disabled* above.
- **Mocking strategy**: prefer real implementations — real temp-dir repos, real fake-agent shell scripts, real `.cycle/log.jsonl` parsing. The only injected seam is `RunCycleOpts.nowFn` (deterministic clock), mirroring the established `sleepFn` injection. Per CLAUDE.md, do not stub `node:fs/promises`.

### Integration / E2E Tests
- End-to-end supervisor run (spawned `dist/cycle.js`) covering the fast-fail bail and the disabled-guard scenarios above is the integration surface. No UI/Playwright tests (SPEC: no UI changes).

## Risk Assessment
- **Counter persistence vs. resume path**: the guard lives only in the primary exec-failure branch; `runResumeOnce` is out of scope. Mitigation: the counter is reset on every terminal drain and success, so a resume interleaving cannot leak a stale count into a fast-bail; tests assert reset-on-different-step and reset-on-success.
- **Coverage floor on `run-cycle.ts` (≥ 90%)**: the new duration branch is small but must be exercised. Mitigation: the deterministic-`nowFn` tests cover the measurement and both emission sites; `cli.ts` has no per-file floor, so the supervisor branch is covered functionally via the spawned-binary integration tests.
- **`sync-defaults` byte-identity**: a stray edit to `.cycle/workflows.yml` would fail the no-diff acceptance. Mitigation: only edit `src/defaults/workflows.yml`, then run `npm run sync-defaults`; verify with `git diff --quiet`.
- **Unreadable-duration semantics drift**: SPEC says "counter does not advance" on unreadable duration; this plan resets to zero (the more conservative not-sub-threshold bucket), which strictly cannot cause a spurious bail. Mitigation: explicit test asserting an unreadable `duration_ms` never advances toward `K`.
