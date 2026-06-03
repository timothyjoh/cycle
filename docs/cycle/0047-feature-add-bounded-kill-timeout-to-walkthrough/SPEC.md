# SPEC — Cycle 0047: Bounded-Kill Timeout for the Walkthrough Hook Spawn

## WHY
`execWalkthroughHook` (`src/engine/walkthrough.ts`) spawns the repo-provided walkthrough hook and resolves only on the child's `close`/`error` events — it arms no timeout. Every other engine step runs through `exec-spawn.ts`, which arms a `setTimeout` that escalates SIGTERM→SIGKILL and marks the result `timedOut`. The name-keyed `walkthrough_capture` intercept in `run-cycle.ts` `continue`s past that machinery, so the hook inherits none of it. Walkthrough hooks are by design the scripts most prone to hanging — they boot headless browsers, wait on dev servers, and record video. A hook that never exits (a `wait-on` that never resolves, a browser that fails to close) blocks `runCycle`, and therefore the entire engine, indefinitely with no observable signal. This directly undercuts trustworthy unattended (AFK) delivery: an unattended run stalls silently rather than failing and moving on.

## CONCRETE USER BENEFIT
A user running the engine unattended with a walkthrough hook configured will see a hung hook **fail the cycle with a visible timeout signal** instead of the engine blocking forever. After this cycle, a hook that exceeds the configured `engine.walkthrough_hook_timeout_ms` is killed (SIGTERM→SIGKILL), the cycle ends `failed` with timeout-specific wording naming the actual exit code, and the engine proceeds through its normal terminal-failure path — observable in `.cycle/log.jsonl` and on stderr.

## USABLE END-STATE
With `engine.walkthrough_hook_timeout_ms` set to a positive value, a walkthrough hook that runs past the threshold is bounded-killed and routed through the fatal step-failure path; with the config absent/`0`/malformed, the hook runs to completion exactly as today. The new config is documented, the existing success path is unchanged, and the timer is injectable so tests do not depend on wall-clock.

## Objective
Give `execWalkthroughHook` the same bounded-kill semantics as `exec-spawn.ts`: arm a config-gated, injectable timeout on spawn that escalates SIGTERM→SIGKILL, marks the result `timedOut`, and routes the timed-out hook through the existing fatal step-failure path with timeout-specific wording — eliminating the indefinite-hang failure mode while preserving the non-timeout success path byte-for-byte.

## Source Issue
`refl-0024-walkthrough-hook-spawn-has-no-timeout-ca` — "Add bounded-kill timeout to walkthrough hook spawn"

## Scope

### In Scope
- Arm a config-gated, injectable timeout inside `execWalkthroughHook` that spawns the hook `detached: true`, on expiry sends SIGTERM then SIGKILL after a grace period (`WALKTHROUGH_KILL_GRACE_MS`), and marks the result `timedOut: true`.
- Read a new `engine.walkthrough_hook_timeout_ms` config defensively at the `run-cycle.ts` read site (positive integer arms the timer; `0`/absent/non-integer/`NaN`/`Infinity`/non-number/malformed ⇒ disabled), and route a timed-out hook through the existing fatal step-failure path (`step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step: "walkthrough_capture" }`) with timeout-specific stderr referencing the actual exit code.
- Document the config in `docs/ENGINE.md` → *Walkthrough capture*, the `engine.*` config list in `CLAUDE.md`, and hold the `src/engine/walkthrough.ts` 95% per-file coverage floor.

### Out of Scope
- Changing the non-timeout success path's collect/manifest-write semantics (best-effort `step.walkthrough_capture_failed`, `walkthrough_artifacts` pointer).
- Adding timeouts to the phase-scoped `walkthrough_before`/`walkthrough_after` semantics beyond what `execWalkthroughHook` already shares with them.
- Auto-applying the timeout default — opting in remains explicit; `DEFAULT_WALKTHROUGH_HOOK_TIMEOUT_MS` is a documented recommendation only.

## Requirements
- On spawn, when the resolved timeout is a positive number, arm an injectable timer (a `timer` seam paralleling `run-cycle.ts`'s `sleepFn`) that on expiry sends SIGTERM to the hook's process group, then SIGKILL after `WALKTHROUGH_KILL_GRACE_MS` (5000 ms), and resolves the `StepResult` with `timedOut: true` and a non-zero exit code once `close` fires.
- The hook is spawned `detached: true` so the kill signals the whole process group (a browser subprocess cannot survive the parent's death).
- `engine.walkthrough_hook_timeout_ms` is resolved defensively at the read site: a positive integer arms the timer; `0`, negative, non-integer, `NaN`, `Infinity`, non-number, absent, or malformed ⇒ disabled (no timer armed, hook runs to completion).
- A timed-out hook routes through the existing fatal step-failure path with timeout-specific stderr referencing the actual signal/exit code (paralleling `formatTimeoutProofError`), not the generic non-zero-exit wording.
- Array args / `shell: false` / `buildChildEnv` discipline and the `CYCLE_ARTIFACT_DIR` (+ `CYCLE_WALKTHROUGH_PHASE` where applicable) re-injection contract are preserved.
- **Failure behavior**: A hook that exceeds the timeout is bounded-killed and surfaces as `step.end { status: "failed" }` + `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` with timeout-specific stderr — never a silent stall and never a swallowed error. With the guard disabled (config `0`/absent/malformed), no timer is armed and behavior is byte-for-byte unchanged. A non-timeout hook failure (non-zero exit) continues to route through the existing fatal path unchanged. The defensive read of a malformed config value degrades to "disabled" rather than throwing.

## Acceptance Criteria
- [ ] **User-observable benefit:** A test driving a hook that sleeps past the threshold asserts the result is marked `timedOut: true`, SIGTERM is sent then SIGKILL after the grace period, and the engine emits `step.end { status: "failed" }` then `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` in that order (instead of blocking indefinitely).
- [ ] The timed-out `step.end.stderr` contains timeout-specific wording referencing the actual exit code, distinct from the generic non-zero-exit message.
- [ ] **Failure-path / disabled-guard:** With `engine.walkthrough_hook_timeout_ms` set to `0` (and separately, absent/malformed), no timer is armed and a hook that exceeds any nominal threshold still runs to completion — asserted via the injectable timer seam (no wall-clock dependence).
- [ ] The timer is injectable for tests (a `timer`/`sleepFn`-style seam), so timeout tests do not sleep in real time.
- [ ] The non-timeout success path (media collect, `walkthrough-artifacts.json` manifest, `walkthrough_artifacts` pointer, best-effort `step.walkthrough_capture_failed`) is unchanged.
- [ ] `engine.walkthrough_hook_timeout_ms` is documented in `docs/ENGINE.md` → *Walkthrough capture* and the `engine.*` config list in `CLAUDE.md`.
- [ ] `src/engine/walkthrough.ts` holds its 95% per-file coverage floor.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- **Framework**: existing `node:test` suite (`tests/engine/walkthrough*.test.ts` / `tests/engine/run-cycle*.test.ts`), no transpile step.
- **Happy path**: a hook that exits cleanly within the threshold completes normally; collect/manifest behavior unchanged.
- **Failure path — timeout**: an injectable timer drives expiry on a hook that would otherwise hang; assert `timedOut: true`, the SIGTERM→SIGKILL escalation (grace = `WALKTHROUGH_KILL_GRACE_MS`), the `step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }` ordering, and timeout-specific stderr wording.
- **Failure path — disabled guard**: `walkthrough_hook_timeout_ms: 0` and absent/malformed values arm no timer; the hook runs to completion. Cover the defensive read-site coercions (`0`/negative/non-integer/`NaN`/`Infinity`/non-number).
- **Regression**: existing walkthrough capture / phase-scoped (`before`/`after`) and `walkthrough_hook_absent` skip tests still pass.
- E2E/Playwright not applicable — this is an engine-internal change with no UI surface.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add `engine.walkthrough_hook_timeout_ms` to the `engine.*` config list (recommended value, disable semantics, SIGTERM→SIGKILL grace, fatal-path routing) and to the `walkthrough.ts` module note.
- **README.md**: No user-facing README change — the config is engine-internal; surfaced via `docs/ENGINE.md` instead.
- **docs/ENGINE.md**: Extend the *Walkthrough capture* section with the bounded-kill timeout, the read-site coercion rules, and the timeout failure-path wording.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `execWalkthroughHook` / `resolveWalkthroughHook` / `collectWalkthroughMedia` / `writeWalkthroughManifest` machinery in `src/engine/walkthrough.ts`.
- The `walkthrough_capture` (and phase-scoped `walkthrough_before`/`walkthrough_after`) name-keyed intercept in `src/engine/run-cycle.ts`.
- `loadConfig` parsing of the `engine.*` block for the new `walkthrough_hook_timeout_ms` field.
- The SIGTERM→SIGKILL escalation pattern in `src/engine/exec-spawn.ts` as the reference implementation.
- No new external services or env vars.
