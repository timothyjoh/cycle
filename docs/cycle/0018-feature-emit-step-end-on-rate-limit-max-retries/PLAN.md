# Implementation Plan: Cycle 0018

## Overview
Add exactly one `step.end` (status `failed`, with a clamped integer `duration_ms` and the failed-step `stderr` excerpt) inside the `rate_limit_max_retries` halt branch of `runCycle`, immediately before the existing `engine.halted` emission, so the rate-limit-exhaustion halt produces the same `step.start`/`step.end` pairing and `step.end → engine.halted → cycle.end` ordering as every other terminal path.

## Current State (from Research)
- The halt branch lives at `src/engine/run-cycle.ts:437–445`. On the `cap + 1`-th rate-limited attempt it emits `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` (`:438–442`), then `cycle.end { status: "failed", failing_step }` (`:443`), then `return { cycleId, artifactDir, status: "failed", failingStep: step.name }` (`:444`) — **before** the shared `step.end` emission at `:567–580`. This is the only terminal path leaving a dangling `step.start` (`:349–354`).
- The shared `step.end` shape to mirror (`:567–580`): `cycle_id: cycleId`, `step: step.name`, `status: r.status`, `exit_code: r.exitCode`, `duration_ms: Math.max(0, Math.round(nowFn() - stepStart))`, plus `stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)` only when `r.status === "failed"`. The `stdout`/`stdout_artifact` fields are bash-only (`isFailedBash`/`stdoutArtifact`) and those locals are declared **below** the halt branch — out of scope there and inapplicable to a rate-limited agent step.
- In-scope locals at the halt branch (confirmed): `stepStart = nowFn()` (`:287`), `nowFn` (`:279`), `step` and `step.name`, `cycleId`, `r` (the most-recent rate-limited `StepResult`, holding `r.exitCode`/`r.stderr`), `MAX_STEP_END_STDERR = 2000` (`:178`), and the imported `truncateHeadCapped`.
- The early `return` at `:444` sits inside the `try`, so the `finally` checkout/base-pull cleanup (`:597–624`) runs regardless and prevents fall-through to the shared `:567` emission (so no double `step.end`).
- Tests: `tests/engine/rate-limit-integration.test.ts`. The boundary-above halt test at `:255–297` (`cap:3`, rate-limit 4×, two-step workflow, asserts one `engine.halted`, `cycle.end` failed, `failingStep === "research"`) is the test to extend. Boundary-below at `:220–253`. `expectExactlyOne` in `tests/helpers.ts:3–10`.

### Resolved Open Questions
- **`exit_code` source**: use `r.exitCode` (the rate-limited result's exit code), matching the shared emission. Confirmed `r` at the halt branch holds the most recent rate-limited `StepResult` (assigned at `:411`/`:407`, checked `r.rateLimited` at `:429`). Not a hardcoded value.
- **Docs scope**: `docs/ENGINE.md` enumerates terminal-path ordering at `:313` and the events block at `:330–336` — both get the `step.end` insertion (prose at `:313`, an event line in the JSON block). CLAUDE.md is the single source of truth at repo root; **no `AGENTS.md` exists** (confirmed), so CLAUDE.md is the only top-level doc to update.

## Desired End State
On the `cap + 1`-th rate-limited attempt for a single step within one `runCycle`, the log contains exactly one `step.end` for that step (`status: "failed"`, integer `duration_ms`, `exit_code` from `r.exitCode`, `stderr` excerpt), emitted before `engine.halted` which precedes `cycle.end`. The function still returns `{ status: "failed", failingStep: <step name> }` through the `finally` cleanup. Verified by `npm run test:coverage` (extended boundary-above test green, boundary-below unregressed) and `npm run typecheck` clean.

## What We're NOT Doing
- No change to retry-count/cap semantics, backoff timing, or the `engine.halted` / `cycle.end` payloads.
- No tightening of the `RATE_LIMIT_PATTERNS` `"429"` matcher (tracked separately in `inbox/`).
- No change to `iteration-guard.ts` / `readCycleEndFailure` (this fix unblocks it but the consumer is out of scope).
- No change to the normal rate-limit pause/retry/resume path (the non-halt branch).
- No `stdout`/`stdout_artifact` fields on the new `step.end` (bash-only; inapplicable to a rate-limited agent step).
- No new config, env var, or external service.

## Implementation Approach
A single localized insertion inside the existing halt branch (`:437–445`), placed at the top of the `if (rateLimitRetries > maxRateLimitRetries)` block before the `engine.halted` emit. The payload is constructed inline to mirror the shared `:567` emission but trimmed to the fields valid at this point (no bash stdout fields). Because the existing early `return` at `:444` already short-circuits before the shared `:567` emission, the new emission is the only `step.end` for this step on this path — no fall-through, no double emission. Then extend the existing boundary-above integration test with the new assertions and update docs.

## Failure & Resilience Decisions

**Task 1 (emit `step.end` in halt branch):**
- **Failure modes**: The only operation is `await log.emit("step.end", …)`, the same sink already used for `engine.halted`/`cycle.end` two lines below. If `log.emit` rejected, the `await` would reject and propagate out of the `try` into the `finally` (cleanup still runs) and out of `runCycle` — identical to the existing `engine.halted`/`cycle.end` emits, which are not individually wrapped. We do not add a `try/catch` around the new emit: swallowing it would reintroduce a silent gap, and the surrounding emits already have this exact (non-)handling. The `duration_ms` computation `Math.max(0, Math.round(nowFn() - stepStart))` cannot throw on numbers and clamps any negative/`stepStart`-unavailable delta to `0` (never negative, never omitted). `truncateHeadCapped(r.stderr, …)` is the same call used at `:574`; `r.stderr` is always a string on a `StepResult`.
- **Idempotency**: `runCycle` re-runs from scratch on engine retry (the per-step `rateLimitRetries` counter is non-persistent, resetting each invocation). A re-run re-emits the full event sequence for a fresh cycle attempt; there is no cross-run dedup expectation for `step.end`, and within a single `runCycle` the early `return` guarantees the new `step.end` fires at most once per halt. No file or external state is mutated by this task.
- **Observability**: This task *increases* observability — the previously-dangling `step.start` now has a matching `step.end`, and the halt remains surfaced via `step.end` (new) + `engine.halted` + `cycle.end` + a failed-cycle return. No silent kill.
- **No silent failure**: No `catch` is added; any `log.emit` rejection propagates exactly as the adjacent emits do. The terminal-failure `return` is unchanged and still surfaces the failure to the supervisor.

**Task 2 (tests)** and **Task 3 (docs)**: N/A — tests assert behavior; docs are prose. No new failure surface.

---

## Task 1: Emit `step.end` on the `rate_limit_max_retries` halt path

### Overview
Insert one `step.end` emission at the top of the halt branch, before `engine.halted`, mirroring the shared emission's failed-step shape (minus bash-only fields).

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**: Inside the `if (rateLimitRetries > maxRateLimitRetries) {` block at `:437`, before the existing `await log.emit("engine.halted", …)` at `:438`, add:

```ts
if (rateLimitRetries > maxRateLimitRetries) {
  // The rate-limit-exhaustion halt returns early (below) before the shared
  // step.end emission at the loop bottom, which would otherwise leave this
  // step's step.start unmatched. Emit the step.end here so this terminal path
  // produces the same step.start/step.end pairing and
  // step.end -> engine.halted -> cycle.end ordering as every other failure
  // path. duration_ms clamps to 0 if nowFn/stepStart yield a negative delta.
  await log.emit("step.end", {
    cycle_id: cycleId,
    step: step.name,
    status: "failed",
    exit_code: r.exitCode,
    duration_ms: Math.max(0, Math.round(nowFn() - stepStart)),
    stderr: truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR),
  });
  await log.emit("engine.halted", {
    reason: "rate_limit_max_retries",
    retries: rateLimitRetries,
    step_index: i,
  });
  await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
  return { cycleId, artifactDir, status: "failed" as const, failingStep: step.name };
}
```

Notes:
- `stderr` is always present (this path is unconditionally a failed step), so it is emitted unconditionally rather than via the `r.status === "failed"` spread used at `:573`.
- No `stdout`/`stdout_artifact` fields: `isFailedBash`/`stdoutArtifact` are not in scope here and a rate-limited step is always an agent (non-bash) step.

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build` via `pretest`)
- [ ] `npm run typecheck` clean — no warnings
- [ ] Exactly one `step.end` for the rate-limited step on the halt path; ordering `step.end → engine.halted → cycle.end`
- [ ] Early `return` value unchanged; `finally` cleanup still runs
- [ ] No second `step.end` for the same step (no fall-through to `:567`)
- [ ] Failure paths behave as designed (errors surfaced, no silent catch)

---

## Task 2: Extend the boundary-above halt test and add a start/end-pairing assertion

### Overview
Extend the existing boundary-above test at `tests/engine/rate-limit-integration.test.ts:255–297` to assert the new `step.end`, its payload, and ordering; reuse the boundary-below test at `:220–253` to confirm no spurious halt-path `step.end`.

### Changes Required
**File**: `tests/engine/rate-limit-integration.test.ts`
**Changes**:
1. In the boundary-above test (`:255–297`), after parsing events, add (the rate-limited step is `"research"`, `step_index: 0`):
   - Import/extend with `expectExactlyOne` from `tests/helpers.ts`.
   - Cardinality-pinned existence + payload of the halt-path `step.end`:
     ```ts
     const haltStepEnd = expectExactlyOne(
       events.filter(e => e.event === "step.end" && e.step === "research"),
       "step.end",
     );
     // or, when only the research step.end exists on this path:
     const researchEnds = events.filter(e => e.event === "step.end" && e.step === "research");
     assert.equal(researchEnds.length, 1);
     assert.equal(researchEnds[0].status, "failed");
     assert.equal(Number.isInteger(researchEnds[0].duration_ms), true);
     assert.ok(researchEnds[0].duration_ms >= 0);
     ```
   - Ordering by event index:
     ```ts
     const iStepEnd  = events.findIndex(e => e.event === "step.end" && e.step === "research");
     const iHalted   = events.findIndex(e => e.event === "engine.halted" && e.reason === "rate_limit_max_retries");
     const iCycleEnd = events.findIndex(e => e.event === "cycle.end" && e.status === "failed");
     assert.ok(iStepEnd >= 0 && iStepEnd < iHalted && iHalted < iCycleEnd);
     ```
   - Start/end pairing for the rate-limited step:
     ```ts
     const starts = events.filter(e => e.event === "step.start" && e.step === "research").length;
     const ends   = events.filter(e => e.event === "step.end"   && e.step === "research").length;
     assert.equal(starts, ends); // both 1 on the halt path
     ```
2. In the boundary-below test (`:220–253`, `cap:3`, rate-limit 3× then success), add an assertion that the step completes via the normal success path and there is no extra/spurious `step.end` for the step beyond the single success emission (the existing `engine.halted` count `=== 0` plus `cycle.end` status `ok` already pin this; add `assert.equal(events.filter(e => e.event === "step.end" && e.step === <step>).length, 1)` and `status === "ok"`).

Use `parseEvents()` (`:43`) and the existing `setupRepo()`/`rateLimitNTimesScript()`/`workflowYml({cap, secondStep})` helpers; inject `sleepFn: noopSleep` to skip backoff (already done in these tests).

### Success Criteria
- [ ] `npm run test:coverage` passes; new assertions green
- [ ] Boundary-above asserts exactly one halt-path `step.end` (`status: "failed"`, integer `duration_ms ≥ 0`), `step.end → engine.halted → cycle.end` ordering, and matching `step.start`/`step.end` counts
- [ ] Boundary-below asserts the cycle completes normally with no spurious halt-path `step.end` (single success `step.end`, `status: "ok"`)
- [ ] All existing rate-limit retry/halt tests still pass
- [ ] `src/engine/run-cycle.ts` per-file coverage floor (90%) and project floors (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) hold via `npm run check:coverage`

---

## Task 3: Update documentation

### Overview
Reflect the new emission in CLAUDE.md and `docs/ENGINE.md`. No README change (internal event-emission correctness).

### Changes Required
**File**: `CLAUDE.md`
**Changes**:
- In the `run-cycle.ts` rate-limit retry-loop architecture note: state that the `rate_limit_max_retries` halt path now emits `step.end` (status `failed`, with `duration_ms`) before `engine.halted` → `cycle.end`, matching all other terminal paths.
- In *Workflow defaults* → the `engine.max_rate_limit_retries` bullet: note that the halt emits `step.end` (status `failed`, with `duration_ms`) before `engine.halted` → `cycle.end`.

**File**: `docs/ENGINE.md`
**Changes**:
- At `:313` (halt-path step list under *Retry loop*): insert "emit `step.end { status: "failed", duration_ms, exit_code, stderr }`" **before** the `engine.halted` emit in the enumerated ordering, noting it matches all other terminal paths.
- In the Events JSON block (`:330–336`): add a `step.end` line (e.g. `{ "event": "step.end", "step": "research", "status": "failed", "exit_code": 1, "duration_ms": 12 }`) immediately before the `engine.halted` line.

**File**: `README.md` — no change (internal correctness; per SPEC).

No `AGENTS.md` exists at repo root (confirmed); CLAUDE.md is the single top-level source.

### Success Criteria
- [ ] CLAUDE.md retry-loop note and `engine.max_rate_limit_retries` bullet mention the new `step.end` emission and ordering
- [ ] `docs/ENGINE.md:313` ordering and the events block (`:330–336`) include the `step.end` emission
- [ ] No README change

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] On the cap + 1-th rate-limited attempt for one step within a single runCycle, the emitted events include exactly one step.end for that step, with status: "failed" and an integer duration_ms, asserted via filter(...).length === 1 / expectExactlyOne.` | Task 1, Task 2 | Emission in Task 1; cardinality-pinned assertion in Task 2 |
| `[ ] The step.end for the rate-limited step is emitted before engine.halted { reason: "rate_limit_max_retries" }, which is emitted before cycle.end { status: "failed" } — verified by event index ordering in the test.` | Task 1, Task 2 | Insertion order in Task 1; index-ordering assertion in Task 2 |
| `[ ] Rate-limiting a step exactly cap times followed by a clean success still completes the cycle and emits its step.end via the normal success path (no spurious halt-path step.end) — existing retry/halt behavior unregressed.` | Task 2 | Boundary-below test extension |
| `[ ] runCycle returns { status: "failed", failingStep: <rate-limited step name> } on the halt path and the finally checkout/base-pull cleanup still runs (existing assertion remains green).` | Task 1, Task 2 | Return unchanged in Task 1; existing assertions remain in Task 2 |
| `[ ] All existing tests still pass, including the existing rate-limit retry/halt tests.` | Task 1, Task 2, Task 3 | `npm run test:coverage` full suite |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Task 1 | `npm run typecheck` |

---

## Testing Strategy

### Unit Tests
- **Halt-path emission (boundary-above)**: `cap:3`, rate-limit the first step (`research`) 4× via `rateLimitNTimesScript`, `sleepFn: noopSleep`. Assert exactly one `step.end` for `research` with `status: "failed"` and integer `duration_ms ≥ 0`; assert `step.end → engine.halted → cycle.end` ordering via `findIndex`; assert `step.start`/`step.end` counts for `research` are equal (1 each).
- **Boundary-below regression**: rate-limit exactly `cap` (3) times then succeed; assert `engine.halted` count `=== 0`, the step's single `step.end` has `status: "ok"`, no spurious halt-path emission, `cycle.end` status `ok`.
- **Failure-path coverage**: the new emission's only failure surface is `log.emit` rejection — covered structurally by reusing the same sink as adjacent emits (no new `catch`); the `duration_ms` clamp is exercised by the integration test's real-clock `nowFn`/`stepStart` (non-negative delta) and is provably `≥ 0` by construction.
- **Mocking strategy**: real implementations — temp git repo, a fake agent shell script on `PATH`, `parseEvents()` over the real `.cycle/log.jsonl`. Only `sleepFn` is injected (`noopSleep`) to skip the 1-hour backoff. No mocking of `log.emit` or `fs`.

### Integration / E2E Tests
- The existing `rate-limit-integration.test.ts` tests *are* full-`runCycle` integration tests (temp repo, real exec, real log). No separate E2E or UI tests required (per SPEC).

## Risk Assessment
- **Double `step.end` (fall-through to `:567`)**: mitigated — the early `return` at `:444` short-circuits before the shared emission; the start/end-pairing assertion (counts equal, both 1) in Task 2 would catch any regression.
- **Wrong `exit_code` source**: mitigated — confirmed `r.exitCode` is the most-recent rate-limited result's exit code at the halt branch; matches the shared emission convention.
- **Coverage floor regression on `run-cycle.ts` (90%)**: low — the new branch is directly exercised by the extended boundary-above test; `npm run check:coverage` gates it.
- **Out-of-scope `stdout`/`stdout_artifact` locals leaking in**: avoided — those locals are declared below the halt branch and are intentionally omitted; a rate-limited step is never bash.
