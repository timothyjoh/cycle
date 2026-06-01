# SPEC — Cycle 0025: Bounded-Kill Timeout for the Walkthrough Hook Spawn

## Objective
The end-of-`feature` walkthrough-capture step spawns a repo-provided hook (`execWalkthroughHook` in `src/engine/walkthrough.ts`) that resolves only on the child's `close`/`error` events, with no wall-clock bound. Walkthrough hooks are the engine's most hang-prone scripts — they boot headless browsers, wait on dev servers, and record video — so a hook that never exits blocks `runCycle`, and therefore the whole engine, indefinitely with no observable signal. This cycle gives `execWalkthroughHook` the same bounded-kill behavior every other step already gets through `exec-spawn.ts`: an armed, config-gated timeout that escalates SIGTERM→SIGKILL, marks the result `timedOut`, and routes the timed-out hook through the existing fatal step-failure path so an unattended run fails and moves on instead of stalling silently.

## Source Issue
`refl-0024-walkthrough-hook-spawn-has-no-timeout-ca` — "Add bounded-kill timeout to walkthrough hook spawn"

## Scope

### In Scope
- Add a config-gated wall-clock timeout to `execWalkthroughHook` that escalates SIGTERM→SIGKILL after a grace period and marks the resolved `StepResult` with `timedOut: true`, mirroring the escalation in `src/engine/exec-spawn.ts`. The timer (and grace-period kill) must be injectable so tests do not depend on wall-clock.
- Read a new `engine.walkthrough_hook_timeout_ms` config at the call site in `src/engine/run-cycle.ts`, defensively coerced (non-integer / `≤ 0` / absent / malformed ⇒ disabled, no timeout; a sensible non-zero default otherwise), and pass it into `execWalkthroughHook`; route a `timedOut` result through the existing fatal step-failure path with timeout-specific failure wording referencing the actual signal/exit code.
- Document the new config in `docs/ENGINE.md` → *Walkthrough capture*, the `engine.*` config list in `CLAUDE.md`, and add tests holding the `src/engine/walkthrough.ts` 95% per-file coverage floor.

### Out of Scope
- Refactoring `execWalkthroughHook` to route through the generic `runAgent`/`exec-spawn.ts` dispatch — the name-keyed intercept in `run-cycle.ts` stays; only its hook spawn gains a timeout.
- Changing the non-timeout success path: media collection, manifest write, and the best-effort `step.walkthrough_capture_failed` degrade semantics are untouched.
- Timeout salvage of partial walkthrough media (no `step.timeout_salvaged` analog for this step) — a timed-out hook is a hard failure.
- Adding the timeout config to any other agent lane or to the default `workflows.yml` shipped value beyond documenting it.

## Requirements
- `execWalkthroughHook` accepts a timeout parameter (milliseconds) and an injectable timer seam. On expiry it sends SIGTERM, schedules a SIGKILL after a fixed grace period, sets `timedOut = true`, and resolves a `StepResult` of `{ status: "failed", exitCode, stdout, stderr, timedOut: true }` once the child's `close` fires. The kill must reliably terminate a hung child (kill the process tree as `exec-spawn.ts` does, since walkthrough hooks spawn browsers/dev-servers/grandchildren that hold pipes open).
- A timeout value of `0`, a negative number, a non-integer, `NaN`, `Infinity`, a non-number, or an absent config disables the timeout entirely — no timer is armed and the hook runs to completion. A valid positive integer arms the timer with that bound. Coercion happens defensively at the `run-cycle.ts` read site, consistent with `max_rate_limit_retries`.
- The default `engine.walkthrough_hook_timeout_ms` is a sensible non-zero value (documented), applied when the config is present but the resolved hook honors the disabled-when-malformed rule above.
- A timed-out hook routes through the existing fatal step-failure path in `run-cycle.ts`: `step.start` → `step.end { status: "failed", exit_code, duration_ms, stderr }` → `cycle.end { status: "failed", failing_step: "walkthrough_capture" }`, and `runCycle` returns `{ status: "failed", failingStep: "walkthrough_capture" }`. The `step.end.stderr` carries timeout-specific wording that references the actual signal/exit code (paralleling `formatTimeoutProofError`), distinguishable from an ordinary non-zero exit.
- A non-timeout success or ordinary non-zero exit behaves exactly as before — no new fields beyond the existing `walkthrough_artifacts` pointer, no behavioral change to media collect / manifest write / `step.walkthrough_capture_failed`.
- **Failure behavior**: A hook that hangs past the configured bound is killed (SIGTERM, then SIGKILL after the grace period) and surfaces as a fatal step failure with timeout-specific stderr — never a silent indefinite stall and never a swallowed error. A spawn `error` event still resolves to a failed `StepResult` as today. When the timeout config is malformed or disabled, the engine degrades to the prior no-timeout behavior (hook may run to completion) rather than failing the spawn. A partially-written set of walkthrough media left behind by a killed hook does not get recorded into a manifest — the timeout failure short-circuits before the collect/manifest step, leaving cycle state at "failed".

## Acceptance Criteria
- [ ] A test driving a hook that sleeps past the configured threshold asserts: the child receives SIGTERM then SIGKILL escalation, the resolved `StepResult` has `timedOut: true` and `status: "failed"`, and the run emits `step.end { step: "walkthrough_capture", status: "failed" }` followed by `cycle.end { status: "failed", failing_step: "walkthrough_capture" }` in that order.
- [ ] The `step.end.stderr` for a timed-out walkthrough hook contains timeout-specific wording referencing the actual signal/exit code, distinct from the message produced by an ordinary non-zero exit.
- [ ] A disabled-guard test (`engine.walkthrough_hook_timeout_ms: 0` and an absent config) confirms no timer is armed and a hook that runs longer than any default still completes to a normal `ok`/`failed` result with no `timedOut` marking.
- [ ] The timeout timer is injectable (a `sleepFn`/timer seam) so the timeout test passes without depending on real wall-clock elapsed time.
- [ ] `engine.walkthrough_hook_timeout_ms` is documented in both `docs/ENGINE.md` → *Walkthrough capture* and the `engine.*` config list in `CLAUDE.md`, including its default and the disabled-when-`0`/absent/malformed rule.
- [ ] `npm run check:coverage` passes with `src/engine/walkthrough.ts` at or above its 95% per-file floor.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).

## Testing Strategy
- Node's built-in `node:test` + `assert` (the repo's existing framework; `--experimental-strip-types`, no transpile).
- Unit tests on `execWalkthroughHook` directly, using a real short-lived `/bin/bash` hook script in a temp directory and an injected timer seam to trigger expiry deterministically:
  - **Happy path**: a fast-exiting hook resolves `{ status: "ok" }` with no `timedOut` flag and no kill signals sent.
  - **Timeout path**: a hook that blocks (e.g. `sleep`) past the injected threshold is killed via SIGTERM→SIGKILL escalation and resolves `{ status: "failed", timedOut: true }`.
  - **Disabled guard**: timeout `0`/absent ⇒ no timer armed; a slow hook still runs to completion.
  - **Spawn error**: an unspawnable hook still resolves to a failed `StepResult` (regression of existing behavior).
- Integration coverage through `runCycle` (or the existing walkthrough-capture run-cycle test harness) asserting the `step.end → cycle.end` failed-ordering and the failed `runCycle` return for a timed-out hook, plus a defensive-coercion test of the `run-cycle.ts` read site for malformed/disabled config values.
- No UI changes — no E2E/Playwright tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add `engine.walkthrough_hook_timeout_ms` to the `## Workflow defaults` `engine.*` config list (default value, disabled-when-`0`/absent/malformed semantics, SIGTERM→SIGKILL escalation, routes through fatal step-failure). Update the `src/engine/walkthrough.ts` architecture note to mention the bounded-kill timeout.
- **README.md**: No user-facing README change — this is an internal engine-resilience config; if a README config table enumerates `engine.*` options, add the new key there.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing walkthrough-capture machinery in `src/engine/walkthrough.ts` and the name-keyed `walkthrough_capture` intercept in `src/engine/run-cycle.ts`.
- The SIGTERM→SIGKILL process-group escalation pattern in `src/engine/exec-spawn.ts` (reference implementation to mirror).
- The `StepResult.timedOut` field in `src/engine/exec-types.ts` (already exists; reused here).
- The `CycleConfig.engine` type in `src/engine/workflow.ts` (extended with the optional `walkthrough_hook_timeout_ms` field).
- No new external services or environment variables.
