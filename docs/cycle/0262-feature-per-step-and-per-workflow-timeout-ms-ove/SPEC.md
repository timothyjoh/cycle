# SPEC — Cycle 0262: Per-step and per-workflow timeout_ms override

## WHY
The engine enforces a single global wall-clock timeout for every agent step
(`engine.step_timeout_ms`, default 45 min). Agents, models, and steps have
wildly different speed profiles: a heavy `build` on a slow model can need far
more wall-clock than a fast `review`. Today an operator can only tune one blunt
ceiling that applies to all steps in all workflows — so to give `build` more
room they must raise the limit for `review` too, weakening the protection that
catches a genuinely-hung fast step. There is no way to say "this step gets 90
minutes" or "every step in this workflow gets 20 minutes" without rewriting the
single global number.

## CONCRETE USER BENEFIT
An operator can set `timeout_ms: 5400000` on the `build` step (or
`timeout_ms: 1200000` as a workflow-level default) in `.cycle/workflows.yml`,
run the engine, and observe that the slow step is allowed its longer budget
while every other step keeps the tighter engine default — without touching
`engine.step_timeout_ms`. The per-step value is what actually arms the
SIGTERM→SIGKILL kill: a step configured with a short `timeout_ms` is killed at
that limit and emits `step.timeout { limit_ms: <resolved value> }`.

## USABLE END-STATE
A `timeout_ms` field is accepted on any step and on any workflow. At runtime
each step's wall-clock budget is resolved
`step.timeout_ms ?? workflow.timeout_ms ?? engine.step_timeout_ms ?? built-in
fallback` and that resolved value is the one the existing timeout machinery
enforces and reports. Configs with no `timeout_ms` anywhere behave exactly as
before.

## Objective
Add an optional `timeout_ms` override resolvable at the step and workflow level,
layered over the existing `engine.step_timeout_ms` default, and thread the
resolved per-step value into the engine's existing `timeoutMs` spawn argument.
This is purely a config-resolution change: all kill, event, and salvage
machinery is reused unchanged. The resolution mirrors the established top-level
`defaults` pattern (`loadConfig` resolving `effective X = step.X ??
defaults.X`).

## Source Issue
`feat-per-step-timeout-override` — "Per-step and per-workflow timeout_ms override"

## Scope

### In Scope
- Add an optional `timeout_ms` field to the `Step` type and the `Workflow`
  type in `src/engine/workflow.ts`, and resolve the effective per-step timeout
  in `loadConfig` (step → workflow → engine), mirroring the existing top-level
  `defaults` resolution so the rest of the engine reads one concrete value.
- Thread the resolved per-step timeout into the existing
  `timeoutMs:` spawn argument in `src/engine/run-cycle.ts` (replacing the
  direct `cfg.engine.step_timeout_ms` read at the agent-step call site) and use
  the same resolved value in the `step.timeout` event's `limit_ms`.
- Update `docs/ENGINE.md` (timeout section) and the `CLAUDE.md` config bullet.

### Out of Scope
- **Idle / no-output / stall detection** — explicitly deferred per the issue;
  this is wall-clock override only.
- **Bash-step timeouts** — agent steps remain the only timed steps unless the
  resolution path covers bash trivially; no new bash timeout behavior.
- Any change to the SIGTERM→SIGKILL kill-tree code, the 5s grace, the
  `result.timedOut` marking, `formatTimeoutProofError`, or `step.timeout_salvaged`.

## Requirements
- `Step` accepts an optional `timeout_ms?: number`; `Workflow` accepts an
  optional default `timeout_ms?: number`.
- The effective per-step timeout resolves
  `step.timeout_ms ?? workflow.timeout_ms ?? engine.step_timeout_ms ??
  built-in fallback`, computed at config-load time consistent with the
  top-level `defaults` resolution already in `loadConfig`.
- The resolved value is passed into the existing `timeoutMs` spawn argument and
  reported as `step.timeout`'s `limit_ms`; the event shape is unchanged.
- **Failure behavior**: Malformed, absent, or non-positive `timeout_ms` values
  (non-number / non-integer / `0` / negative / `NaN` / `Infinity`) at either the
  step or workflow level are ignored defensively at the read site and fall
  through to the next level of the resolution order — never throw and never arm
  a zero/negative timer. A step whose resolved timeout is reached is killed and
  surfaces a `step.timeout` event (limit reported) routed through the existing
  fatal timeout path; the error is never swallowed. A config that sets a valid
  short `timeout_ms` and a step that exceeds it must observably time out rather
  than run to the larger engine default.

## Acceptance Criteria
- [ ] An operator can set `timeout_ms` on a step in `.cycle/workflows.yml`, run
  the engine, and that step is enforced/killed at the step value while other
  steps keep the engine default — verified by a test asserting the resolved
  per-step `timeoutMs` / `step.timeout.limit_ms` equals the step value.
- [ ] Step-level `timeout_ms` overrides a workflow-level `timeout_ms`, which in
  turn overrides `engine.step_timeout_ms`; absent at all levels resolves to the
  engine default (then the built-in fallback).
- [ ] A malformed / non-positive `timeout_ms` at the step level falls back to
  the workflow value (and an invalid workflow value falls back to the engine
  default) rather than arming a zero/negative timer or throwing.
- [ ] The `step.timeout` event shape and the SIGTERM→SIGKILL/kill-tree code are
  byte-for-byte unchanged; existing timeout tests still pass.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node built-in test runner (`npm test` / `npm run test:coverage`), matching the
  existing `loadConfig` and `run-cycle` test suites.
- Scenarios:
  - **Happy path**: step `timeout_ms` set → resolved value flows to `timeoutMs`
    and `step.timeout.limit_ms`.
  - **Resolution precedence**: step beats workflow beats engine; workflow beats
    engine; absent → engine default; engine absent → built-in fallback.
  - **Failure paths**: malformed/`0`/negative/`NaN`/`Infinity`/non-number at
    step and workflow level each coerce to the next level; never throws, never a
    non-positive timer.
  - **Regression**: a config with no `timeout_ms` anywhere produces an unchanged
    resolved timeout (still `engine.step_timeout_ms`), and existing
    `step.timeout` behavior is unchanged.
- No UI changes; no E2E tests required.

## Documentation Updates
- **CLAUDE.md**: update the timeout-related config bullet to document the new
  `step.timeout_ms` / `workflow.timeout_ms` override and the
  `step → workflow → engine → fallback` resolution order.
- **docs/ENGINE.md**: extend the timeout section to describe the resolution
  precedence and that the resolved value is what the existing kill/event/salvage
  machinery enforces and reports.
- **README.md**: no user-facing surface beyond the config reference covered by
  CLAUDE.md/ENGINE.md; no change required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing hard-timeout foundation, all already present:
  - Wall-clock SIGTERM→SIGKILL child-tree kill (`src/engine/exec-spawn.ts`).
  - `engine.step_timeout_ms` applied via `timeoutMs:` at the agent-step call
    site (`src/engine/run-cycle.ts`).
  - `step.timeout` event, `formatTimeoutProofError`, `step.timeout_salvaged`
    (`src/engine/run-cycle.ts`).
  - `result.timedOut` marking (`src/engine/exec-types.ts`).
  - The top-level `defaults` resolution pattern in `loadConfig`
    (`src/engine/workflow.ts`) used as the model for this change.
- No external services or env vars required.
