# Implementation Plan: Cycle 0262

## Overview
Add an optional `timeout_ms` field to the `Step` and `Workflow` types, resolve each step's effective wall-clock budget `step.timeout_ms ?? workflow.timeout_ms ?? engine.step_timeout_ms` at config-load time (mirroring the top-level `defaults` pattern), and thread that resolved value into the existing `timeoutMs:` spawn argument and `step.timeout` event. Pure config-resolution change — all kill/event/salvage machinery is reused byte-for-byte.

## Current State (from Research)
- `Step` (`src/engine/workflow.ts:6-14`) and `Workflow` (`:21-26`) have **no** `timeout_ms` field today.
- `EngineConfig.step_timeout_ms` (`:34-36`) is the single global per-step timeout (optional `number`; absent ⇒ `undefined` ⇒ no timer; no hard-coded numeric default).
- `loadConfig` (`:87-168`) already resolves the top-level `defaults` block by writing effective values back onto each concrete `step` (`:148-165`) so the rest of the engine reads one concrete value. This is the model to mirror.
- The agent-step call site reads the engine value raw: `timeoutMs: cfg.engine.step_timeout_ms` (`src/engine/run-cycle.ts:660`).
- The `step.timeout` event reports `limit_ms: cfg.engine.step_timeout_ms ?? null` (`run-cycle.ts:720`).
- The timer is armed only when `timeoutMs && timeoutMs > 0` (`src/engine/exec-spawn.ts:75`) — the sole guard; `engine.step_timeout_ms` is not coerced anywhere today.
- Defensive numeric coercion convention (`max_rate_limit_retries`, `run-cycle.ts:643-645`): `typeof v === "number" && Number.isInteger(v) && v > 0 ? v : <fallback>`.
- Test models: `tests/engine/workflow-defaults.test.ts` (load-time resolution-precedence), `tests/engine/run-cycle.completion-proof.test.ts:25-69,254,300-335` (end-to-end timeout-kill + salvage; helper currently injects only engine-level `step_timeout_ms`).

## Desired End State
- `Step` and `Workflow` each accept an optional `timeout_ms?: number`.
- After `loadConfig`, every concrete `step.timeout_ms` holds the resolved effective value (`step → workflow → engine`, with malformed step/workflow values ignored and falling through).
- `run-cycle.ts:660` passes `step.timeout_ms`; `run-cycle.ts:720` reports `step.timeout.limit_ms: step.timeout_ms ?? null`.
- A config with no `timeout_ms` anywhere resolves each `step.timeout_ms` to exactly `engine.step_timeout_ms` (byte-for-byte regression).
- `docs/ENGINE.md` timeout section and the `CLAUDE.md` config bullet document the resolution order.
- Verify: `npm test` and `npm run typecheck` clean; new tests assert resolution precedence and that a short step-level `timeout_ms` observably kills the step.

## What We're NOT Doing
- **No idle / no-output / stall detection** — wall-clock override only.
- **No bash-step timeout behavior** — agent steps remain the only timed steps; bash steps are untouched.
- **No change** to the SIGTERM→SIGKILL kill-tree, the 5 s grace, `result.timedOut` marking, `formatTimeoutProofError`, `step.timeout_salvaged`, or the `step.timeout` event shape.
- **No new hard-coded numeric "built-in fallback"** — when `timeout_ms` is absent at every level *and* `engine.step_timeout_ms` is absent, the result is `undefined` ⇒ no timer armed (the existing behavior). "Built-in fallback" is resolved to mean "the existing no-timer-when-fully-absent behavior," not a new constant.
- **No coercion of the engine-level value** — `engine.step_timeout_ms` is passed through as the final fallback exactly as today (raw), so the no-override path is byte-for-byte unchanged.
- **No `src/defaults/workflows.yml` change** (no shipped example `timeout_ms`), so no `npm run sync-defaults` required.
- **No structural invariant** added (Step optional fields `model`/`thinking` have none; `timeout_ms` follows suit).

## Implementation Approach
Resolution lands in `loadConfig`, mirroring the existing `defaults` loop. A pure, exported helper `resolveStepTimeoutMs(stepRaw, workflowRaw, engineTimeout)` computes the effective value:

```ts
const coerceTimeout = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;

export function resolveStepTimeoutMs(
  stepTimeout: unknown,
  workflowTimeout: unknown,
  engineTimeout: number | undefined
): number | undefined {
  return coerceTimeout(stepTimeout) ?? coerceTimeout(workflowTimeout) ?? engineTimeout;
}
```

Key decisions resolving the RESEARCH open questions:
1. **Where resolution lands (Q1):** in `loadConfig`, writing effective `step.timeout_ms` onto each concrete step — the SPEC's explicit instruction to "mirror the top-level `defaults` resolution already in `loadConfig`." Coercion is folded into the same helper so step/workflow malformed values are "ignored defensively" exactly where they're consumed.
2. **Engine level passed through raw:** `coerceTimeout` applies only to step/workflow; the engine value is the un-coerced final fallback. This guarantees the no-override path produces `step.timeout_ms === engine.step_timeout_ms` byte-for-byte.
3. **Built-in fallback (Q2):** no new constant; absent-everywhere ⇒ `undefined` ⇒ no timer (existing behavior).
4. **Defaults file / sync (Q3):** untouched.
5. **Structural invariant (Q4):** none.

`run-cycle.ts` changes from reading `cfg.engine.step_timeout_ms` to reading the already-resolved `step.timeout_ms` at both sites.

## Failure & Resilience Decisions

**Task 1 (types):** N/A — pure type declarations, no runtime surface.

**Task 2 (`resolveStepTimeoutMs` + `loadConfig` resolution):**
- **Failure modes:** malformed/non-positive `timeout_ms` at step or workflow level (non-number / non-integer / `0` / negative / `NaN` / `Infinity`). Response: the helper *degrades* — `coerceTimeout` returns `undefined` for any invalid value, falling through to the next level; never throws, never returns a non-positive number. A malformed value is silently ignored **by design** (SPEC requirement: ignore, do not throw — diverging from the unknown-agent throw path), so no `workflows.yml malformed:` error is raised for `timeout_ms`.
- **Idempotency:** pure function over its inputs; `loadConfig` is re-run safely (it parses fresh each call and writes a deterministic effective value). Re-running yields identical resolved steps.
- **Observability:** the resolved value is surfaced downstream via the existing `step.timeout.limit_ms` event (unchanged shape) when a timeout fires. No new event needed; resolution is deterministic and inspectable in the loaded config.
- **No silent failure:** the only "swallowed" case is an *intentionally* ignored malformed value, which the SPEC mandates. It is not an error condition — it is a documented fall-through. There is no I/O or subprocess in the helper.

**Task 3 (`run-cycle.ts` read-site rewiring):**
- **Failure modes:** the resolved `step.timeout_ms` may be `undefined` (no timer) or a positive integer (timer armed). Both flow into the unchanged `exec-spawn.ts:75` guard `timeoutMs && timeoutMs > 0`. A step that reaches its timeout is SIGTERM/SIGKILL-killed, marked `timedOut`, emits `step.timeout`, and routes through the existing fatal timeout path — error never swallowed.
- **Idempotency:** the resolved timeout participates in the existing per-step retry loop (rate-limit retries, `max_cycle_attempts`) with no new persistent state; re-running a step re-reads the same resolved value.
- **Observability:** `step.timeout { cycle_id, step, limit_ms: <resolved value> }` emitted on kill (only `limit_ms`'s value changes — from global to resolved). Completion-proof message still branches on `r.timedOut`.
- **No silent failure:** a timed-out step surfaces via `step.timeout` + the fatal step-failure routing; nothing is caught and dropped.

**Task 4 (docs):** N/A — pure documentation.

---

## Task 1: Add `timeout_ms` to `Step` and `Workflow` types

### Overview
Declare the optional field on both types so configs can carry it and the rest of the engine reads a concrete `step.timeout_ms`.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**:
- Add to `Step` (after `thinking?: string;`):
  ```ts
  /** Per-step wall-clock timeout (ms) override. Optional; resolved at load
   * time as step.timeout_ms ?? workflow.timeout_ms ?? engine.step_timeout_ms.
   * Malformed/non-positive ignored defensively (falls through). */
  timeout_ms?: number;
  ```
- Add to `Workflow` (after `steps: Step[];`):
  ```ts
  /** Workflow-level default per-step wall-clock timeout (ms). Overridden by a
   * step's own timeout_ms; overrides engine.step_timeout_ms. */
  timeout_ms?: number;
  ```

### Success Criteria
- [ ] `npm run typecheck` clean.
- [ ] `npm run build` clean.

---

## Task 2: Resolve effective per-step timeout in `loadConfig`

### Overview
Add the pure `resolveStepTimeoutMs` helper and call it inside the existing per-step resolution loop, writing the effective value onto each concrete step (mirroring the `defaults` loop). Engine-level value passed through un-coerced as the final fallback.

### Changes Required
**File**: `src/engine/workflow.ts`
**Changes**:
- Add module-level pure helper (exported for unit testing):
  ```ts
  const coerceTimeout = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;

  /** Resolve a step's effective wall-clock timeout:
   * step.timeout_ms ?? workflow.timeout_ms ?? engine.step_timeout_ms.
   * Step/workflow malformed/non-positive values are ignored (fall through);
   * the engine value is passed through un-coerced as the final fallback so a
   * config with no step/workflow override is byte-for-byte unchanged. */
  export function resolveStepTimeoutMs(
    stepTimeout: unknown,
    workflowTimeout: unknown,
    engineTimeout: number | undefined
  ): number | undefined {
    return coerceTimeout(stepTimeout) ?? coerceTimeout(workflowTimeout) ?? engineTimeout;
  }
  ```
- Inside the existing `for (const w of parsed.workflows) { for (const step of w.steps) { … } }` loop (`:148-165`), after the `defaults` model/thinking writes, add:
  ```ts
  step.timeout_ms = resolveStepTimeoutMs(step.timeout_ms, w.timeout_ms, parsed.engine.step_timeout_ms);
  ```
  This writes the effective value onto each concrete step (`undefined` if nothing valid resolves, preserving the no-timer path).

### Success Criteria
- [ ] Compiles/typechecks cleanly.
- [ ] Step-level value wins over workflow-level, which wins over engine-level (unit-tested).
- [ ] Malformed step value falls through to workflow; malformed workflow falls through to engine (unit-tested).
- [ ] No `timeout_ms` anywhere ⇒ each `step.timeout_ms === engine.step_timeout_ms` (incl. `undefined` when engine absent).
- [ ] Helper never throws and never returns `0`/negative/`NaN`/`Infinity`.
- [ ] Failure paths behave as designed (malformed values silently fall through per SPEC; no error swallowed beyond the intentional ignore).

---

## Task 3: Thread the resolved value into the spawn arg and `step.timeout` event

### Overview
Replace the two direct `cfg.engine.step_timeout_ms` reads in `run-cycle.ts` with the load-time-resolved `step.timeout_ms`.

### Changes Required
**File**: `src/engine/run-cycle.ts`
**Changes**:
- Line 660: `timeoutMs: cfg.engine.step_timeout_ms,` → `timeoutMs: step.timeout_ms,`
- Line 720: `limit_ms: cfg.engine.step_timeout_ms ?? null` → `limit_ms: step.timeout_ms ?? null`

(`step` here is the concrete loadConfig-resolved step, so `step.timeout_ms` already holds the effective value. No other call site reads `cfg.engine.step_timeout_ms` for the agent-step budget.)

### Success Criteria
- [ ] Compiles/typechecks cleanly.
- [ ] An end-to-end test with a short step-level `timeout_ms` observably kills the step (`r.timedOut === true`, `step.timeout.limit_ms` equals the step value) while a config without it keeps prior behavior.
- [ ] Existing `run-cycle.completion-proof.test.ts` timeout/salvage tests still pass unchanged.
- [ ] Failure paths behave as designed (timed-out step surfaces `step.timeout` + fatal routing; nothing swallowed).

---

## Task 4: Documentation updates

### Overview
Document the new override and the `step → workflow → engine → (no-timer)` resolution order.

### Changes Required
**File**: `CLAUDE.md`
**Changes**: Add a config bullet near the existing timeout-related config (style-matched to the `engine.walkthrough_hook_timeout_ms` bullet) documenting `step.timeout_ms` / `workflow.timeout_ms`, the `step → workflow → engine → no-timer` resolution, and that malformed/non-positive step/workflow values are ignored (fall through) — never throw, never arm a zero/negative timer.

**File**: `docs/ENGINE.md`
**Changes**: Extend the timeout section (near `:163-168`) to describe the three-level resolution precedence, that the engine value is the un-coerced final fallback, that absent-everywhere means no timer, and that the resolved value is what the unchanged kill/event/salvage machinery enforces and reports.

**File**: `README.md` — no change (per SPEC; config reference covered by CLAUDE.md/ENGINE.md).

### Success Criteria
- [ ] CLAUDE.md and docs/ENGINE.md describe the resolution order and the defensive ignore behavior.
- [ ] No stale claim that `engine.step_timeout_ms` is the only timeout knob.

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] An operator can set `timeout_ms` on a step in `.cycle/workflows.yml`, run the engine, and that step is enforced/killed at the step value while other steps keep the engine default — verified by a test asserting the resolved per-step `timeoutMs` / `step.timeout.limit_ms` equals the step value. | Task 2 + Task 3 | Resolution (T2) + read-site rewiring (T3); end-to-end + precedence tests in Testing Strategy. |
| [ ] Step-level `timeout_ms` overrides a workflow-level `timeout_ms`, which in turn overrides `engine.step_timeout_ms`; absent at all levels resolves to the engine default (then the built-in fallback). | Task 2 | `resolveStepTimeoutMs` precedence; "built-in fallback" = no-timer when engine also absent. |
| [ ] A malformed / non-positive `timeout_ms` at the step level falls back to the workflow value (and an invalid workflow value falls back to the engine default) rather than arming a zero/negative timer or throwing. | Task 2 | `coerceTimeout` rejects non-number/non-integer/`0`/negative/`NaN`/`Infinity` and falls through. |
| [ ] The `step.timeout` event shape and the SIGTERM→SIGKILL/kill-tree code are byte-for-byte unchanged; existing timeout tests still pass. | Task 3 | Only `limit_ms`'s value changes; `exec-spawn.ts` untouched; existing tests re-run. |
| [ ] All existing tests still pass. | Task 2 + Task 3 | `npm test` gate. |
| [ ] No compiler/linter warnings introduced (`npm run typecheck` clean). | Task 1 + Task 2 + Task 3 | `npm run typecheck` gate. |

---

## Testing Strategy

### Unit Tests
**File**: `tests/engine/workflow-defaults.test.ts` (extend) or a new `tests/engine/workflow-timeout.test.ts` following the same `mkdtemp` + write `.cycle/workflows.yml` + `loadConfig(root)` model.

- **Precedence (happy path):**
  - Step `timeout_ms` set + workflow `timeout_ms` set + engine `step_timeout_ms` set ⇒ resolved `step.timeout_ms` === step value.
  - Only workflow + engine set ⇒ resolved === workflow value.
  - Only engine set ⇒ resolved === engine value.
  - None set ⇒ resolved === `undefined` (engine absent) and resolved === engine value when only engine present (regression: byte-for-byte equals `engine.step_timeout_ms`).
- **Failure paths (each coerces to the next level; never throws, never non-positive):** for step level and workflow level independently, assert each of `0`, `-1`, `1.5` (non-integer), `NaN`, `Infinity`, `"600000"` (string/non-number) falls through to the next level. Confirm `loadConfig` does **not** throw for any of these (contrast with the unknown-agent throw).
- **Pure-helper direct tests:** call `resolveStepTimeoutMs` directly across the matrix above for fast, isolated coverage of every branch.
- **Mocking strategy:** none — use real `loadConfig` against temp repos and direct calls to the exported pure helper (anti-mock bias).

### Integration / E2E Tests
**File**: `tests/engine/run-cycle.completion-proof.test.ts` (extend the `workflowYml` / `setupRepo` helpers to optionally emit a step-level and workflow-level `timeout_ms`, not only the engine-level `step_timeout_ms`).

- **Short step-level `timeout_ms` ⇒ observable timeout:** a step with a small step-level `timeout_ms` (e.g. 200 ms) and a hung fake agent ⇒ `r.timedOut === true`, exactly one `step.timeout` with `limit_ms` equal to the step value (cardinality-pinned `filter(...).length === 1`), routed through the existing fatal/salvage path.
- **Workflow-level applies when step absent:** a workflow-level `timeout_ms` with no step override ⇒ the step is killed at the workflow value (`step.timeout.limit_ms` === workflow value).
- **Regression:** the existing engine-level `step_timeout_ms` timeout/salvage test passes unchanged (config with no step/workflow `timeout_ms` behaves exactly as before).

### Risk Assessment
- **Risk:** writing `step.timeout_ms = undefined` onto steps in `loadConfig` could surprise code that does `"timeout_ms" in step`. **Mitigation:** no engine code branches on key presence; only the value is read at `run-cycle.ts:660/720`. Verified by `npm test`.
- **Risk:** coercing the engine-level value would change the no-override path. **Mitigation:** engine value is deliberately passed through un-coerced as the final fallback; regression test asserts byte-for-byte equality with `engine.step_timeout_ms`.
- **Risk:** coverage floor on `src/engine/run-cycle.ts` (≥90%) and global `workflow.ts` coverage. **Mitigation:** the two run-cycle line changes touch already-covered branches; new `loadConfig`/helper branches are covered by the unit-test matrix in-cycle.
