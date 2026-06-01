# Implementation Plan: Cycle 0017

## Overview
Bound the previously-unbounded rate-limit retry loop in `runCycle` with a configurable `engine.max_rate_limit_retries` cap (default `24`), so a permanent rate-limit condition self-terminates with `engine.halted { reason: "rate_limit_max_retries" }` and a failed cycle result instead of pausing/retrying forever.

## Current State (from Research)
- The change site is the inner `while (true)` step-dispatch loop at `src/engine/run-cycle.ts:394`–`427`. The `r.rateLimited` branch (`:418`–`424`) reads `cfg.engine.rate_limit_backoff_ms ?? 3_600_000`, emits `engine.paused { reason, retry_at }`, calls `await sleepFn(backoffMs)`, sets `wasRateLimited = true`, and `continue`s. Any non-rate-limit result `break`s. Post-loop, `if (wasRateLimited && r.status === "ok")` emits `engine.resumed { reason: "rate_limit_cleared" }` (`:428`–`430`).
- `wasRateLimited` is declared per-step at `src/engine/run-cycle.ts:393`, inside the `for (let i = startIdx; i < wf.steps.length; i++)` step loop (`:285`). The new counter is declared at the same scope so it resets per step and naturally starts at zero on a resume entry to a different `startIdx`.
- `EngineConfig` is at `src/engine/workflow.ts:28`–`45`; sibling optional numeric fields (`rate_limit_backoff_ms?`, `step_timeout_ms?`, `min_step_duration_ms?`) pass through `loadConfig` unvalidated — all defaulting happens at read sites.
- Read-site defensive-coercion pattern to replicate: the iteration-too-fast guard at `src/cli.ts:529`–`535` (`typeof rawMin === "number" && Number.isFinite(rawMin) && rawMin > 0 ? rawMin : 0`).
- Defaults `engine:` block: `src/defaults/workflows.yml:3`–`12`. `npm run sync-defaults` copies `src/defaults/` → `.cycle/`.
- Existing terminal-failure return shape to mirror: `return { cycleId, artifactDir, status: "failed" as const, failingStep: step.name }` (`src/engine/run-cycle.ts:564`), preceded by a `cycle.end` failed emit. The `finally` block (`:570`–`597`) runs checkout/base-pull on any early `return`.
- `engine.halted` is today emitted only by the supervisor (`src/cli.ts:646`–`651`) with `{ failed_cycles, reason: "max_consecutive_failures", threshold }`. This cycle adds a second emission site inside `runCycle` with a distinct `reason` and field set.
- Test harness: `tests/engine/rate-limit-integration.test.ts` (temp git repo + fake agent shell script driven by a `call_count` file; `runCycle(root, { …, sleepFn: noopSleep })`; events parsed from `.cycle/log.jsonl`).

## Desired End State
- `EngineConfig.max_rate_limit_retries?: number` exists; `src/defaults/workflows.yml` and `.cycle/workflows.yml` both carry `max_rate_limit_retries: 24` (sync-defaults leaves no diff).
- The rate-limit branch increments a per-step counter; when it exceeds the effective cap it emits exactly one `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` and returns a failed cycle result before sleeping/retrying again.
- A `0`/negative/non-integer/malformed cap resolves to `24` at the read site.
- `CLAUDE.md` and `docs/ENGINE.md` document the cap and halt reason; the "unbounded / Known limitation" notes are replaced.
- `npm test`, `npm run test:coverage` (incl. the `src/engine/run-cycle.ts` 90% floor), and `npm run typecheck` all pass.

Verify: new boundary tests in `tests/engine/rate-limit-integration.test.ts` pass; `git diff --stat .cycle/workflows.yml` empty after sync; grep `docs/ENGINE.md` for `rate_limit_max_retries`.

## What We're NOT Doing
- Not tightening `RATE_LIMIT_PATTERNS` / `isRateLimitError` detection (tracked in `inbox/`).
- Not changing backoff duration, `engine.paused`/`engine.resumed` shapes, or the supervisor `max_consecutive_failures` path.
- Not persisting the counter across restarts or across cycles/steps — per-`runCycle`, per-step, in-memory only.
- Not adding a CLI flag override; config via `workflows.yml` only.
- Not validating/coercing the field inside `loadConfig` — coercion stays at the read site, matching the existing convention.

## Implementation Approach
Add the optional field to the `EngineConfig` type and the defaults YAML. In `runCycle`, resolve the effective cap once per `runCycle` invocation (or inline at the read site) using the established defensive coercion, declare a `rateLimitRetries` counter alongside `wasRateLimited` inside the per-step body, and inside the `r.rateLimited` branch increment-then-compare: increment the counter first, and if it now exceeds the effective cap, emit `engine.halted` and `return` the failed result *before* the `engine.paused`/sleep. This makes the boundary precise: rate-limiting exactly `cap` times leaves the counter at `cap` (never exceeds → keeps retrying, so a subsequent success completes the cycle); the `cap + 1`-th rate-limited attempt pushes the counter to `cap + 1`, which exceeds `cap` and halts with `retries: cap + 1`. The `return` is inside the same `try`, so the `finally` cleanup runs unchanged.

## Failure & Resilience Decisions

**Task 1 (type) / Task 2 (defaults YAML):** N/A — pure type addition and static config; no runtime failure surface. Sync-defaults is a build-time copy whose correctness is asserted by the no-diff acceptance test.

**Task 3 (cap resolution + halt logic in `runCycle`):**
- **Failure modes**: Malformed config (`0`, negative, non-integer, non-number, `NaN`, `Infinity`) → coerced to default `24` at the read site via `typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 24`; never yields a zero-length or unbounded loop. Cap exceeded → deliberate, observable termination via `engine.halted` + failed return (not an error/throw). No new I/O is introduced; `log.emit` failure behavior is unchanged from every other emit in the loop.
- **Idempotency**: The counter is local to a single `runCycle`/step iteration and non-persistent, so engine retry/restart of a cycle starts the count fresh — re-runs are safe by construction. The early `return` flows through the existing `finally` (checkout/base-pull), so cleanup is idempotent and not skipped.
- **Observability**: `engine.halted { reason: "rate_limit_max_retries", retries: N, step_index: i }` is appended to `.cycle/log.jsonl` before returning; the failed status propagates to `run-one.ts` exit 1 and the supervisor's terminal-failure accounting. The effective cap is the value actually used by the loop, making malformed-config coercion observable through behavior.
- **No silent failure**: Termination is surfaced via the log event and a `status: "failed"` return — never a silent kill or swallowed error. Non-rate-limit control flow (`break`, existing failure routing) is untouched.

**Task 4 (docs):** N/A — pure documentation.

---

## Task 1: Add `max_rate_limit_retries` to `EngineConfig`

### Overview
Declare the optional field on the engine config type next to the existing optional numeric engine fields.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**: In the `EngineConfig` interface (`:28`–`45`), after `min_step_duration_ms?` / near `compress_output?`, add:
```ts
  /** Per-step consecutive rate-limit retry cap before engine.halted; read-site
   *  default 24 when absent/malformed (0/negative/non-integer). */
  max_rate_limit_retries?: number;
```
No `loadConfig` change — the field passes through verbatim like the other numeric engine fields.

### Success Criteria
- [ ] `npm run typecheck` clean
- [ ] Field is optional (`?`) and typed `number`
- [ ] Failure paths behave as designed (N/A — pure type)

---

## Task 2: Add default to `workflows.yml` and sync

### Overview
Add `max_rate_limit_retries: 24` to the defaults `engine:` block and propagate to `.cycle/`.

### Changes Required
**File**: `src/defaults/workflows.yml`
**Changes**: In the `engine:` block (`:3`–`12`), next to `rate_limit_backoff_ms` / `step_timeout_ms`:
```yaml
  max_rate_limit_retries: 24
```
Then run `npm run sync-defaults` so `.cycle/workflows.yml` matches (must leave no diff).

### Success Criteria
- [ ] `src/defaults/workflows.yml` `engine:` block contains `max_rate_limit_retries: 24`
- [ ] `git diff .cycle/workflows.yml` shows the synced addition and `npm run sync-defaults` is idempotent (re-running leaves no further diff)
- [ ] Builds cleanly
- [ ] Failure paths behave as designed (N/A — static config)

---

## Task 3: Bound the retry loop with the cap and emit `engine.halted`

### Overview
Resolve the effective cap defensively, count consecutive rate-limited attempts of the current step, and terminate the loop with `engine.halted` + a failed return when the count exceeds the cap.

### Changes Required
**File**: `src/engine/run-cycle.ts`

**(a) Resolve the effective cap.** Once per `runCycle` (e.g. near where `cfg` is consumed) or inline at the read site, using the `src/cli.ts:529`–`535` coercion pattern:
```ts
// Defensive read-site default: a 0/negative/non-integer/non-number/NaN/Infinity
// configured cap is treated as the default 24 — never an unbounded or zero-length loop.
const rawCap = cfg.engine.max_rate_limit_retries;
const maxRateLimitRetries =
  typeof rawCap === "number" && Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 24;
```

**(b) Declare the per-step counter** alongside `wasRateLimited` (`:393`):
```ts
let wasRateLimited = false;
let rateLimitRetries = 0; // per-step, per-runCycle, non-persistent
```

**(c) Gate the rate-limit branch before sleeping** (`:418`–`424`). Increment-then-compare:
```ts
if (r.rateLimited) {
  rateLimitRetries++;
  if (rateLimitRetries > maxRateLimitRetries) {
    await log.emit("engine.halted", {
      reason: "rate_limit_max_retries",
      retries: rateLimitRetries,
      step_index: i,
    });
    await log.emit("cycle.end", { cycle_id: cycleId, status: "failed", failing_step: step.name });
    return { cycleId, artifactDir, status: "failed" as const, failingStep: step.name };
  }
  const backoffMs = cfg.engine.rate_limit_backoff_ms ?? 3_600_000;
  const retryAt = new Date(Date.now() + backoffMs).toISOString();
  await log.emit("engine.paused", { reason: "rate_limit", retry_at: retryAt });
  await sleepFn(backoffMs);
  wasRateLimited = true;
  continue;
}
break;
```
Boundary: rate-limiting exactly `cap` times leaves `rateLimitRetries === cap` (never `> cap`), so the loop keeps retrying and a subsequent success exits normally (emitting `engine.resumed`); the `cap + 1`-th rate-limited attempt sets `rateLimitRetries === cap + 1 > cap` and halts with `retries: cap + 1`. The `return` is inside the existing `try`, so the `finally` block (`:570`–`597`) runs.

Mirror the existing `cycle.end` failed emit (`:563`) so the failed-cycle log shape is consistent with the other terminal-failure return. Confirmed no consumer asserts a uniform `engine.halted` schema across the supervisor and `runCycle` sites — the new field set `{ reason, retries, step_index }` is independent of the supervisor's `{ failed_cycles, reason, threshold }`.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean
- [ ] Counter declared per-step (resets each step iteration and on resume to a new `startIdx`)
- [ ] `cap`-times-then-success → no `engine.halted`, cycle ok, exactly one `engine.resumed`
- [ ] `cap + 1` rate-limited attempts → exactly one `engine.halted { reason: "rate_limit_max_retries" }`, `status: "failed"`, no later `step.start`
- [ ] `engine.halted.retries === cap + 1`, `step_index === i` of the rate-limited step
- [ ] `0`/negative/non-integer cap resolves to effective `24`
- [ ] Non-rate-limit success/failure control flow unchanged
- [ ] Failure paths behave as designed (halt surfaced via event + failed return; `finally` cleanup runs; malformed config degrades to `24`; no swallowed error)

---

## Task 4: Documentation

### Overview
Document the cap, its default, semantics, and the new halt reason; remove the "unbounded / Known limitation" notes.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: In "Workflow defaults", add a bullet:
> - `engine.max_rate_limit_retries` — per-step consecutive rate-limit retry cap (default `24`; `0`/negative/non-integer/malformed ⇒ default `24` at the read site). When a single step is rate-limited more than the cap times within one `runCycle`, the engine emits `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` and returns a failed cycle result through the normal terminal-failure path — never a silent kill.

Also update the `src/engine/run-cycle.ts` rate-limit retry-loop architecture note: change "The retry loop is unbounded — exits only on clean success or non-rate-limit failure" to state it is now bounded by `engine.max_rate_limit_retries` (default `24`), halting with `engine.halted { reason: "rate_limit_max_retries" }`.

**File**: `docs/ENGINE.md`
**Changes**: In "Rate-Limit Pause/Retry Loop" (`:298`–`339`), replace the "Known limitation: unbounded" statements (`:322`, `:339`) with: the cap (`engine.max_rate_limit_retries`, default `24`), the increment-then-compare boundary semantics, the `engine.halted { reason: "rate_limit_max_retries", retries, step_index }` event and its fields, and the read-site coercion of malformed values to `24`.

### Success Criteria
- [ ] `CLAUDE.md` "Workflow defaults" documents the cap and halt reason; run-cycle note says "bounded"
- [ ] `docs/ENGINE.md` documents the cap, halt reason, event fields, and coercion; no "unbounded / Known limitation" wording remains
- [ ] Failure paths behave as designed (N/A — docs)

---

## Task 5: Boundary integration tests

### Overview
Add cap-boundary tests to the existing rate-limit integration suite, reusing its temp-repo + fake-agent + `call_count` harness.

### Changes Required
**File**: `tests/engine/rate-limit-integration.test.ts`
**Changes**: Extend `workflowYml()` (`:16`–`34`) to accept/emit `max_rate_limit_retries` in the `engine:` block (parameterized; keep `rate_limit_backoff_ms: 100`, `mode: trunk`). Drive the fake agent off the `call_count` file to rate-limit a configurable number of times then succeed (rate-limit signaled the same way the existing rate-limit tests do, producing `r.rateLimited`). Add:

1. **Boundary-below (cap then success)**: set `max_rate_limit_retries: 3`; agent rate-limits exactly 3 times then succeeds. Assert: `events.filter(e => e.event === "engine.halted").length === 0`, exactly one `engine.resumed { reason: "rate_limit_cleared" }`, `cycle.end status: "ok"`.
2. **Boundary-above (cap + 1)**: `max_rate_limit_retries: 3`; agent rate-limits 4 times. Assert: `events.filter(e => e.event === "engine.halted" && e.reason === "rate_limit_max_retries").length === 1`, that event's `retries === 4` and `step_index === 0`, returned `status: "failed"`, and no `step.start` for a later step index.
3. **Bad config → effective 24**: `max_rate_limit_retries: 0` (and a negative/non-integer variant); agent rate-limits e.g. 5 times then succeeds. Assert no `engine.halted` and a successful cycle — demonstrating the effective cap is `24`, not `0`. (Avoid driving 25 real retries; the `noopSleep` seam plus a count well under 24 demonstrates the `0`→`24` coercion without an unbounded loop. Optionally assert effective behavior at the 24/25 boundary in one focused case if cheap with `noopSleep`.)
4. **Regression**: keep/confirm the existing single-retry-then-success path still emits `engine.paused` then `engine.resumed` unchanged.

Use `noopSleep` for all (`sleepFn: noopSleep`). Cardinality-pin `engine.halted` with `filter(...).length === 1` per CLAUDE.md test conventions (or `expectExactlyOne`).

### Success Criteria
- [ ] All four scenarios pass under `npm test`
- [ ] `engine.halted` assertions use `filter(...).length === 1` cardinality pinning
- [ ] `npm run test:coverage` passes, including the `src/engine/run-cycle.ts` 90% floor (new halt branch covered)
- [ ] Real implementations used (real temp git repo, real `runCycle`, fake agent shell script) — no engine internals mocked beyond the `sleepFn` seam
- [ ] Failure-path test (cap + 1) asserts the failed return and absence of later `step.start`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] EngineConfig.max_rate_limit_retries?: number exists in src/engine/workflow.ts and src/defaults/workflows.yml engine: block has max_rate_limit_retries: 24; npm run sync-defaults leaves .cycle/workflows.yml in sync (no diff).` | Task 1, Task 2 | Type in Task 1; YAML + sync in Task 2 |
| `[ ] Integration test: an agent that rate-limits exactly max_rate_limit_retries times then succeeds does NOT emit engine.halted and the cycle completes (cycle.end status: ok).` | Task 5 | Scenario 1 (boundary-below) |
| `[ ] Integration test: an agent that rate-limits max_rate_limit_retries + 1 times emits exactly one engine.halted { reason: "rate_limit_max_retries" } and the cycle returns status: "failed" (no further step execution).` | Task 5 | Scenario 2 (boundary-above) |
| `[ ] The emitted engine.halted event carries the correct retries count and a step_index matching the rate-limited step.` | Task 3, Task 5 | Emitted in Task 3; asserted `retries === cap+1`, `step_index === 0` in Task 5 |
| `[ ] Failure-path criterion: with max_rate_limit_retries configured to 0 (or a negative/non-integer value), the loop falls back to the default 24 rather than halting immediately or looping forever — covered by a test asserting the effective cap is 24.` | Task 3, Task 5 | Coercion in Task 3; Scenario 3 asserts effective cap |
| `[ ] CLAUDE.md config list and docs/ENGINE.md "Rate-Limit Pause/Retry Loop" section document the cap and the rate_limit_max_retries halt reason (the "Known limitation: unbounded" note is updated/removed).` | Task 4 | |
| `[ ] npm run test:coverage passes all coverage gates (including the src/engine/run-cycle.ts 90% per-file floor).` | Task 5 | New halt branch exercised by Scenario 2 |
| `[ ] All existing tests still pass (npm test).` | Task 3, Task 5 | Non-rate-limit control flow untouched; regression scenario 4 |
| `[ ] No compiler/linter warnings introduced (npm run typecheck clean).` | Task 1, Task 3 | |

---

## Testing Strategy

### Unit Tests
- Effective-cap coercion is validated through behavior (Scenario 3: `0`/negative/non-integer → no halt for retry counts well below 24), not a separately exported pure function, since coercion lives inline at the read site matching the existing convention. If a small pure helper is extracted for the coercion, add a direct table test (`0 → 24`, `-1 → 24`, `2.5 → 24`, `NaN → 24`, `Infinity → 24`, `3 → 3`, `undefined → 24`).
- Failure-path tests:
  - Cap exceeded (subprocess repeatedly signals rate-limit): Scenario 2 — asserts exactly one `engine.halted`, failed return, no later `step.start`.
  - Malformed config (bad YAML value): Scenario 3 — asserts degrade to default behavior.
- Mocking strategy: prefer real implementations — real temp git repo, real `runCycle`, a real fake-agent shell script driven by `call_count`. The only seam is `sleepFn: noopSleep` to skip the backoff wait (already established in the suite).

### Integration / E2E Tests
- All scenarios are integration-level by construction (full `runCycle` against a temp repo, events read from `.cycle/log.jsonl`). No UI/E2E/Playwright required (SPEC: engine-internal).
- End-to-end check: cap + 1 rate-limits → halt event present, cycle status failed, exit path through `run-one.ts` (exercised implicitly via `runCycle` return; the supervisor terminal-failure accounting is out of scope and not re-tested here).

## Risk Assessment
- **Off-by-one at the boundary**: mitigated by pinning increment-then-compare (`rateLimitRetries++; if (> cap) halt`) and by both boundary tests (exactly `cap` → ok; `cap + 1` → halt with `retries === cap + 1`).
- **Counter not resetting on resume to a different step**: mitigated by declaring the counter inside the per-step body alongside `wasRateLimited`, so it is fresh each iteration including the resume entry.
- **Coverage floor regression on `run-cycle.ts`**: mitigated by Scenario 2 exercising the new halt branch (emit + failed return); verify with `npm run test:coverage` before commit.
- **`.cycle/workflows.yml` drift**: mitigated by running `npm run sync-defaults` and asserting a clean diff per the acceptance criterion.
- **Schema-collision concern between the two `engine.halted` sites**: confirmed no consumer asserts a uniform schema across sites; the new `{ reason, retries, step_index }` shape is independent of the supervisor's, and `reason` distinguishes them.
