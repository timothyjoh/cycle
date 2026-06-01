# Implementation Plan: Cycle 0025

## Overview
Give `execWalkthroughHook` (`src/engine/walkthrough.ts`) a config-gated, bounded-kill wall-clock timeout — an injectable timer that escalates SIGTERM→SIGKILL across the child's process group, marks the resolved `StepResult` `timedOut: true`, and routes the timed-out hook through the existing fatal `walkthrough_capture` step-failure path in `run-cycle.ts` with timeout-specific stderr wording, so a hung walkthrough hook fails-and-moves-on instead of stalling the engine indefinitely.

## Current State (from Research)
- `execWalkthroughHook(repoRoot, hookAbsPath, env)` (`src/engine/walkthrough.ts:36-59`) spawns `/bin/bash <hook>` **without** `detached: true`, accumulates stdout/stderr, and resolves a `StepResult` only on the child's `error`/`close` events. No timer, no kill, no single-resolve guard.
- The reference escalation lives in `runAgent` (`src/engine/exec-spawn.ts:40-93`): `detached: true` (own process group), a `settled`/`done(r)` single-resolve guard that clears both timers, a `killTree(sig)` that calls `process.kill(-child.pid, sig)` with a `child.kill(sig)` fallback in try/catch, an `if (timeoutMs && timeoutMs > 0)` arm-guard, SIGTERM-then-`setTimeout(SIGKILL, 5_000)` grace escalation, both timers `.unref()`'d, and the `timedOut ? {…, timedOut: true} : {…}` close-shape branch.
- The `walkthrough_capture` name-keyed intercept (`src/engine/run-cycle.ts:354-406`): spawns the hook at `:367-370`, the `wr.status === "failed"` fatal branch (`:371-382`) emits `step.end { status: "failed", exit_code, duration_ms, stderr: truncateHeadCapped(wr.stderr, MAX_STEP_END_STDERR) }` → `cycle.end { status: "failed", failing_step }` → returns `{ cycleId, artifactDir, status: "failed", failingStep }`.
- Defensive read-site coercion convention: `max_rate_limit_retries` at `src/engine/run-cycle.ts:482-484` — `typeof rawCap === "number" && Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 24`.
- Timeout-specific wording precedent: `formatTimeoutProofError(stepName, artifactPath, exitCode)` at `:207-209`, distinct from `formatCompletionProofError` at `:203-205`. SIGTERM-killed children typically report `exit_code: 143`.
- `StepResult` already carries the optional `timedOut?: true` field (`src/engine/exec-types.ts`); reused, no change.
- `EngineConfig` (`src/engine/workflow.ts:28-54`) — extend with `walkthrough_hook_timeout_ms?: number` alongside the existing `step_timeout_ms?` / `walkthrough_hook?` fields.
- `src/engine/walkthrough.ts` has a **95%** per-file coverage floor. Existing unit tests at `tests/engine/walkthrough.test.ts:119-162` (ok / exit-1 / spawn-error); integration tests at `tests/engine/run-cycle.walkthrough.test.ts` (the non-zero fatal-routing test at `:201-226` is the model for the timeout integration test).
- `docs/ENGINE.md:201-213` *Walkthrough capture* — the "Known limitation" paragraph at `:213` names "a future `engine.walkthrough_hook_timeout_ms`" and must be updated.

## Desired End State
- `execWalkthroughHook` accepts an optional 4th options argument carrying `timeoutMs` and an injectable timer seam; on expiry it kills the hook's process group via SIGTERM→SIGKILL escalation, sets `timedOut: true`, and resolves `{ status: "failed", exitCode, stdout, stderr, timedOut: true }` once `close` fires. A single-resolve guard prevents timeout + `close`/`error` double-resolution.
- `run-cycle.ts` reads `engine.walkthrough_hook_timeout_ms` with defensive coercion (absent / `0` / negative / non-integer / `NaN` / `Infinity` / non-number ⇒ disabled, no timer armed; valid positive integer arms), passes it into `execWalkthroughHook`, and on a `timedOut` failed result emits the fatal `step.end`/`cycle.end` with timeout-specific stderr wording referencing the actual exit code.
- Non-timeout success, ordinary non-zero exit, media collection, manifest write, and the `step.walkthrough_capture_failed` degrade path are byte-for-byte unchanged.
- Verify: new unit + integration tests pass; `npm test`, `npm run typecheck`, and `npm run check:coverage` (walkthrough.ts ≥ 95%) all green; `docs/ENGINE.md` and `CLAUDE.md` document the new key.

## What We're NOT Doing
- Not refactoring `execWalkthroughHook` to route through `runAgent`/`exec-spawn.ts` — the name-keyed `run-cycle.ts` intercept stays.
- Not adding `walkthrough_hook_timeout_ms` to the shipped `src/defaults/workflows.yml` (out of scope per SPEC) — so **no `npm run sync-defaults` run is required** (Open Question 3, resolved below).
- No timeout-salvage of partial media (no `step.timeout_salvaged` analog) — a timed-out hook is a hard failure that short-circuits before collect/manifest.
- No changes to `resolveWalkthroughHook`, `collectWalkthroughMedia`, `writeWalkthroughManifest`, or the success-path `step.end` shape (`walkthrough_artifacts` pointer unchanged).
- No new agent lane gets a timeout; no new env vars or external services.
- No user-facing README change beyond documenting the key (no README `engine.*` table exists to extend).

## Implementation Approach
Mirror the proven `exec-spawn.ts` escalation rather than inventing a new one. Add an **optional options object** (`{ timeoutMs?, setTimer? }`) as the 4th parameter of `execWalkthroughHook` so the existing 3-arg positional callers (`run-cycle.ts:367-370` and `tests/engine/walkthrough.test.ts`) keep compiling unchanged (Open Question 2, resolved: optional-options-object seam). The timer seam is injected as a function with the same shape as `setTimeout` returning a handle with a `clear()`, defaulting to a real-`setTimeout` wrapper that `.unref()`s; tests inject a synchronous fake that fires callbacks deterministically with no wall-clock dependence.

Add `detached: true` to the spawn options (currently absent) so `killTree` can signal the whole process group — required because walkthrough hooks spawn browsers/dev-servers/grandchildren that hold pipes open and would otherwise prevent `close`.

The `engine.walkthrough_hook_timeout_ms` default value (Open Question 1, resolved) is **`600_000` ms (10 minutes)** — generous enough for browser boot + dev-server wait + video record, bounded enough to fail an unattended run in reasonable time. It is exported as a named constant `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS` and **documented as the recommended configured value**. Per the binding Acceptance Criteria (an *absent* config arms no timer), the read site does **not** silently apply this default on absent/malformed config — absent/`0`/malformed ⇒ disabled. The constant is the documented value users set to opt in; this reconciles SPEC Requirement prose ("a sensible non-zero default, documented") with Acceptance line 3 ("an absent config confirms no timer is armed") by making the default a documented recommendation rather than an applied fallback.

## Failure & Resilience Decisions

**Task 1 — `execWalkthroughHook` timeout + kill (subprocess execution):**
- **Failure modes**: (a) spawn `error` (e.g. `/bin/bash` missing) → resolves `{ status: "failed", exitCode: -1, stderr: stderr + String(err) }`, preserved as today (never rejects). (b) Hook hangs past `timeoutMs` → timer fires, `timedOut = true`, `killTree("SIGTERM")`, then a grace-period `killTree("SIGKILL")`; `close` fires and resolves `{ status: "failed", …, timedOut: true }`. (c) `process.kill(-pid)` throws (group already gone / no pid) → caught, falls back to `child.kill(sig)` in nested try/catch, swallowing only the "already-dead" case (mirrors `exec-spawn.ts:71-74`).
- **Idempotency**: pure spawn-per-call; no persisted state, no lockfile. The engine re-invokes the step each cycle attempt with the same deterministic `CYCLE_ARTIFACT_DIR`/`walkthrough/` path (last-write-wins, hook author's responsibility). The **single-resolve `settled`/`done` guard** is the retry-safety mechanism added here so timeout + `close` + `error` cannot double-resolve the Promise.
- **Observability**: the function returns a structured `StepResult`; the `timedOut: true` marker is the diagnostic signal the caller turns into a logged event. No logging inside the function itself (consistent with the current design — `run-cycle.ts` owns emission).
- **No silent failure**: every terminal path resolves a `StepResult` (failed on error/timeout/non-zero, ok on exit 0); no `catch {}` swallows anything except the documented "process already gone" kill fallback. The timed-out result is explicitly `status: "failed"`.

**Task 2 — `run-cycle.ts` read-site coercion + fatal routing (config read, event emission):**
- **Failure modes**: malformed/absent/`≤0`/non-integer/`NaN`/`Infinity`/non-number config ⇒ coerced to `0` ⇒ no timer armed (degrade to prior no-timeout behavior — hook may run to completion). A `timedOut` failed result routes through the **existing** fatal branch (no new code path), differing only in the `stderr` text via `formatWalkthroughTimeoutError`.
- **Idempotency**: pure read + existing emit/return path; the early `return` still flows through the `finally` checkout/base-pull cleanup (unchanged documented behavior). Re-running the cycle re-reads config and re-spawns — safe.
- **Observability**: `step.start` → `step.end { status: "failed", exit_code, duration_ms, stderr: <timeout-specific> }` → `cycle.end { status: "failed", failing_step: "walkthrough_capture" }`. The timeout-specific stderr (referencing the actual exit code, e.g. 143) makes a timeout distinguishable from an ordinary non-zero exit in `.cycle/log.jsonl`.
- **No silent failure**: a hung hook is now killed and surfaced as a fatal step failure; nothing is swallowed. Coercion-to-disabled is an intentional documented degrade, not a swallowed error.

**Task 3 — Documentation:** N/A — pure docs, no failure surface.

---

## Task 1: Add bounded-kill timeout + injectable timer seam to `execWalkthroughHook`

### Overview
Give `execWalkthroughHook` the `exec-spawn.ts` escalation: `detached: true` process group, `settled`/`done` single-resolve guard, `killTree`, an arm-only-when-positive timeout, SIGTERM→SIGKILL grace escalation, and the `timedOut` close-shape branch — driven by an optional, injectable timer seam.

### Changes Required

**File**: `src/engine/walkthrough.ts`

**Changes**:
1. Add exported constants:
   ```ts
   /** Grace period (ms) between SIGTERM and the escalation SIGKILL — mirrors exec-spawn.ts. */
   export const WALKTHROUGH_KILL_GRACE_MS = 5_000;
   /** Documented recommended value for engine.walkthrough_hook_timeout_ms (10 min).
    * NOT auto-applied: an absent/malformed config disables the timeout (see run-cycle read site). */
   export const DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS = 600_000;
   ```
2. Define the timer-seam type and default:
   ```ts
   export type WalkthroughTimer = (ms: number, cb: () => void) => { clear: () => void };
   const defaultTimer: WalkthroughTimer = (ms, cb) => {
     const t = setTimeout(cb, ms);
     if (t.unref) t.unref();
     return { clear: () => clearTimeout(t) };
   };
   ```
3. Extend the signature with an optional options object (keeps 3-arg callers working):
   ```ts
   export function execWalkthroughHook(
     repoRoot: string,
     hookAbsPath: string,
     env: Record<string, string>,
     opts: { timeoutMs?: number; timer?: WalkthroughTimer } = {},
   ): Promise<StepResult> {
   ```
4. In the Promise body: add `detached: true` to the spawn options; add `let timedOut = false; let settled = false;` plus `done(r)` and `killTree(sig)` helpers copied in spirit from `exec-spawn.ts:51-74`; track the timeout handle and kill handle and clear them in `done`. Replace the direct `resolve(...)` calls in `error`/`close` with `done(...)`, and make `close` branch on `timedOut`:
   ```ts
   const timer = opts.timer ?? defaultTimer;
   let timeoutHandle: { clear: () => void } | undefined;
   let killHandle: { clear: () => void } | undefined;
   const done = (r: StepResult) => {
     if (settled) return;
     settled = true;
     timeoutHandle?.clear();
     killHandle?.clear();
     resolve(r);
   };
   const killTree = (sig: NodeJS.Signals) => {
     try { if (child.pid) process.kill(-child.pid, sig); }
     catch { try { child.kill(sig); } catch { /* already gone */ } }
   };
   child.on("error", err => done({ status: "failed", exitCode: -1, stdout, stderr: stderr + String(err) }));
   child.on("close", code => done(timedOut
     ? { status: "failed", exitCode: code ?? -1, stdout, stderr, timedOut: true }
     : { status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr }));
   if (opts.timeoutMs && opts.timeoutMs > 0) {
     timeoutHandle = timer(opts.timeoutMs, () => {
       timedOut = true;
       killTree("SIGTERM");
       killHandle = timer(WALKTHROUGH_KILL_GRACE_MS, () => killTree("SIGKILL"));
     });
   }
   ```
   (The spawn-error handler keeps the existing `stderr + String(err)` shape — do **not** change it to `(err as Error).message`, preserving the regression contract.)

### Success Criteria
- [ ] Compiles/builds cleanly (`npm run build`, `npm run typecheck`)
- [ ] Existing 3-arg callers in `run-cycle.ts` and `tests/engine/walkthrough.test.ts` compile unchanged
- [ ] Happy-path unit test: fast hook resolves `{ status: "ok" }`, no `timedOut`, injected timer's callback never invoked / no signals sent
- [ ] Timeout unit test: a `trap '' TERM; sleep 30` hook with an injected timer firing both callbacks is killed via SIGTERM→SIGKILL and resolves `{ status: "failed", timedOut: true }`
- [ ] Disabled unit test: `timeoutMs: 0` and omitted ⇒ no timer armed (injected timer never called)
- [ ] Spawn-error unit test still resolves a failed `StepResult` (no rejection)
- [ ] Failure paths behave as designed (single-resolve guard prevents double-resolve; kill fallback try/catch only swallows already-gone)

---

## Task 2: Read & coerce `engine.walkthrough_hook_timeout_ms` and route timed-out hook through fatal path

### Overview
Extend `EngineConfig`, read the new config at the `walkthrough_capture` intercept with defensive coercion, pass `timeoutMs` into `execWalkthroughHook`, and emit timeout-specific stderr when the failed result is `timedOut`.

### Changes Required

**File**: `src/engine/workflow.ts`
**Changes**: Add to `EngineConfig` (after `walkthrough_hook?`):
```ts
/** Bounded-kill wall-clock timeout (ms) for the walkthrough_capture hook spawn.
 * Absent / 0 / negative / non-integer / NaN / Infinity / non-number ⇒ disabled
 * (no timer armed; hook runs to completion). A valid positive integer arms a
 * SIGTERM→SIGKILL escalation. Coerced defensively at the run-cycle read site.
 * Documented recommended value: 600000 (10 min). */
walkthrough_hook_timeout_ms?: number;
```

**File**: `src/engine/run-cycle.ts`
**Changes**:
1. Import the new helpers/constant from `./walkthrough.ts` (extend the existing import at `:34`): add `WALKTHROUGH_KILL_GRACE_MS` only if referenced (not required at call site — grace is internal).
2. Add a timeout-wording helper next to `formatTimeoutProofError` (`:207-209`):
   ```ts
   export function formatWalkthroughTimeoutError(stepName: string, exitCode: number): string {
     return `${stepName} timed out (exit ${exitCode}) — hook killed (SIGTERM→SIGKILL) — treating as failure`;
   }
   ```
3. In the `walkthrough_capture` intercept, before the spawn, coerce the config (mirror `max_rate_limit_retries`):
   ```ts
   const rawWtTimeout = cfg.engine.walkthrough_hook_timeout_ms;
   const walkthroughTimeoutMs =
     typeof rawWtTimeout === "number" && Number.isInteger(rawWtTimeout) && rawWtTimeout > 0
       ? rawWtTimeout : 0; // 0 ⇒ disabled (absent/negative/non-integer/NaN/Infinity/non-number)
   ```
4. Pass it into the spawn (`:367-370`):
   ```ts
   const wr = await execWalkthroughHook(
     repoRoot, hook, { ...cycleEnv, CYCLE_ARTIFACT_DIR: artifactDir },
     { timeoutMs: walkthroughTimeoutMs },
   );
   ```
5. In the `wr.status === "failed"` fatal branch (`:371-382`), choose stderr by `wr.timedOut`:
   ```ts
   const failStderr = wr.timedOut
     ? truncateHeadCapped(`${formatWalkthroughTimeoutError(step.name, wr.exitCode)}\n${wr.stderr}`, MAX_STEP_END_STDERR)
     : truncateHeadCapped(wr.stderr, MAX_STEP_END_STDERR);
   ```
   and use `failStderr` in the `step.end` payload. Everything else (`exit_code`, `duration_ms`, `cycle.end`, the return shape) is unchanged.

### Success Criteria
- [ ] Compiles/builds cleanly; `npm run typecheck` clean
- [ ] Integration test (timeout): a hung hook + a small configured `walkthrough_hook_timeout_ms` (driven via injected timer through `runCycle`, or a real-but-bounded hook) emits `step.end { step: "walkthrough_capture", status: "failed" }` then `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` in that order, and `runCycle` returns `{ status: "failed", failingStep: "walkthrough_capture" }`
- [ ] The timed-out `step.end.stderr` contains the `formatWalkthroughTimeoutError` wording referencing the actual exit code, distinct from an ordinary non-zero-exit stderr
- [ ] Coercion unit test: `0`, `-1`, `1.5`, `NaN`, `Infinity`, `"x"`, `undefined` all resolve to `0` (disabled); `600000` resolves to `600000`
- [ ] Disabled integration test: absent config ⇒ a slow hook runs to completion (no `timedOut`, normal ok/failed)
- [ ] Existing walkthrough integration tests (skip-clean, media+pointer, no-media, manifest degrade, non-zero fatal) still pass unchanged
- [ ] Failure paths behave as designed (no swallowed error; timeout surfaces as fatal step failure)

---

## Task 3: Document the new config

### Overview
Document `engine.walkthrough_hook_timeout_ms` in `docs/ENGINE.md` and `CLAUDE.md`, and update the `walkthrough.ts` architecture note.

### Changes Required

**File**: `docs/ENGINE.md` (*Walkthrough capture*, `:201-213`)
**Changes**: Replace the "Known limitation" paragraph (`:213`) that names "a future `engine.walkthrough_hook_timeout_ms`" with the now-implemented behavior: the config's default recommended value (`600000`), the disabled-when-`0`/absent/malformed rule, the SIGTERM→SIGKILL (`WALKTHROUGH_KILL_GRACE_MS = 5000`) escalation, the `timedOut` fatal routing (`step.end → cycle.end`, `failing_step: "walkthrough_capture"`), and the timeout-specific stderr (exit 143 convention). Note the timeout short-circuits before collect/manifest (no partial-media salvage).

**File**: `CLAUDE.md` (*Workflow defaults* `engine.*` list, and the `src/engine/walkthrough.ts` architecture note)
**Changes**:
1. Add a bullet to the `engine.*` list:
   > `engine.walkthrough_hook_timeout_ms` — bounded-kill wall-clock timeout (ms) for the `walkthrough_capture` hook spawn. Documented recommended value `600000` (10 min); `0`/negative/non-integer/`NaN`/`Infinity`/non-number/absent ⇒ disabled (no timer armed, hook runs to completion), coerced defensively at the `run-cycle.ts` read site. On expiry the hook's process group is killed SIGTERM→SIGKILL (5s grace) and routed through the fatal step-failure path with timeout-specific stderr.
2. In the `src/engine/walkthrough.ts` paragraph, append that `execWalkthroughHook` now takes an optional `{ timeoutMs, timer }` and performs SIGTERM→SIGKILL bounded-kill on expiry.

### Success Criteria
- [ ] `docs/ENGINE.md` *Walkthrough capture* describes the implemented config (no "future" wording remains)
- [ ] `CLAUDE.md` `engine.*` list and architecture note both mention the key, default, and disabled rule
- [ ] No stale references to an unimplemented timeout remain

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| [ ] A test driving a hook that sleeps past the configured threshold asserts: the child receives SIGTERM then SIGKILL escalation, the resolved `StepResult` has `timedOut: true` and `status: "failed"`, and the run emits `step.end { step: "walkthrough_capture", status: "failed" }` followed by `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` in that order. | Task 1 + Task 2 | Unit escalation test (Task 1) + integration ordering test (Task 2) |
| [ ] The `step.end.stderr` for a timed-out walkthrough hook contains timeout-specific wording referencing the actual signal/exit code, distinct from the message produced by an ordinary non-zero exit. | Task 2 | `formatWalkthroughTimeoutError`, `wr.timedOut` branch |
| [ ] A disabled-guard test (`engine.walkthrough_hook_timeout_ms: 0` and an absent config) confirms no timer is armed and a hook that runs longer than any default still completes to a normal `ok`/`failed` result with no `timedOut` marking. | Task 1 + Task 2 | Unit disabled test + integration absent-config test |
| [ ] The timeout timer is injectable (a `sleepFn`/timer seam) so the timeout test passes without depending on real wall-clock elapsed time. | Task 1 | `opts.timer` seam, synchronous fake in tests |
| [ ] `engine.walkthrough_hook_timeout_ms` is documented in both `docs/ENGINE.md` → *Walkthrough capture* and the `engine.*` config list in `CLAUDE.md`, including its default and the disabled-when-`0`/absent/malformed rule. | Task 3 | |
| [ ] `npm run check:coverage` passes with `src/engine/walkthrough.ts` at or above its 95% per-file floor. | Task 1 | New unit tests cover timeout/disabled/kill branches |
| [ ] All existing tests still pass (`npm test`). | Task 1 + Task 2 | Backward-compatible optional-arg signature; no behavior change off the timeout path |
| [ ] No compiler/linter warnings introduced (`npm run typecheck`). | Task 1 + Task 2 + Task 3 | |

---

## Testing Strategy

### Unit Tests (`tests/engine/walkthrough.test.ts`, extend `:119-162`)
- **Happy path**: fast-exiting hook (`exit 0`) with an injected timer ⇒ `{ status: "ok" }`, no `timedOut`, timer callback never fired.
- **Timeout / escalation**: hook `trap '' TERM; sleep 30` (ignores SIGTERM so only SIGKILL terminates it) + an injected `timer` that fires the timeout callback synchronously and then fires the grace callback ⇒ resolves `{ status: "failed", timedOut: true }`, exit code reflects SIGKILL. Asserts escalation by observing the child only dies after the second (SIGKILL) callback, with no real wall-clock wait.
- **Disabled guard**: `timeoutMs: 0` and omitted-opts ⇒ injected timer never invoked; a hook with a small real `sleep` still completes to `ok`/`failed` with no `timedOut`.
- **Spawn error** (regression): unspawnable hook still resolves a failed `StepResult`, not a rejection; single-resolve guard verified (close-after-error does not double-resolve).
- **Coercion** (in `run-cycle` test or a focused helper test): `0`, `-5`, `1.5`, `NaN`, `Infinity`, `"600000"`, `undefined` ⇒ `0`; `600000` ⇒ `600000`.
- **Mocking strategy**: real `/bin/bash` hook scripts in `mkdtemp` temp dirs, `chmod 0o755`, cleanup in `finally` — no `node:fs/promises` stubbing. The only injected seam is the deterministic `timer` (per CLAUDE.md: prefer injectable seams over wall-clock).

### Integration / E2E Tests (`tests/engine/run-cycle.walkthrough.test.ts`, model on `:201-226`)
- **Timeout fatal routing**: configure a hung `.cycle/walkthrough.sh` and a `walkthrough_hook_timeout_ms`, drive `runCycle` with an injected timer (or a bounded real timeout), assert `step.end → cycle.end` failed-ordering (cardinality-pinned via `filter(...).length === 1` / `expectExactlyOne`), `failing_step: "walkthrough_capture"`, the `runCycle` return `{ status: "failed", failingStep: "walkthrough_capture" }`, and timeout-specific `step.end.stderr` wording.
- **Disabled (absent config)**: a slow-but-finite hook with no `walkthrough_hook_timeout_ms` runs to completion (existing media/manifest path still works).
- **Regression**: existing non-zero fatal-routing test still passes with ordinary (non-timeout) stderr wording.
- No UI/Playwright tests (no UI surface).

## Risk Assessment
- **`detached: true` changes process-group semantics** for the hook: mitigated by mirroring the already-proven `exec-spawn.ts` pattern exactly; the parent still awaits `close` (never `.unref()`'d). Happy-path test confirms no regression.
- **SIGTERM-ignoring child needed to prove SIGKILL escalation**: mitigated by `trap '' TERM` in the test hook so the kill path is deterministically exercised; the injected timer removes wall-clock flakiness.
- **Coverage floor (95%) on the new branches**: mitigated by unit tests covering armed/disabled/timeout/kill-fallback and the `timedOut` close branch; the `process.kill(-pid)` catch fallback is the hardest line — exercised by the SIGKILL escalation test where the group kill succeeds and (in a follow-up assertion) a no-pid path triggers the `child.kill` fallback.
- **Default-not-auto-applied may surprise users** expecting timeout protection out of the box: mitigated by clear documentation that absent ⇒ disabled and that `600000` is the recommended opt-in value, consistent with the binding Acceptance Criteria.
