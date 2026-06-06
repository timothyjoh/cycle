---
id: feat-per-step-timeout-override
source: manual
title: "Per-step and per-workflow timeout_ms override"
added_at: 2026-06-06T12:00:00Z
priority: medium
---

## Problem

The engine has a single global `engine.step_timeout_ms` (default 2700000 = 45 min). Different agents/models/steps have very different speed profiles — a slow `build` and a fast `review` cannot be tuned independently without raising the global ceiling for every step. Operators on slower models or heavier repos must patch one blunt number.

## Already shipped — do NOT rebuild

The hard-timeout foundation already exists; this issue only adds an override layer on top of it.

- Wall-clock timeout with SIGTERM→SIGKILL child-tree kill (5s grace): `src/engine/exec-spawn.ts`
- `engine.step_timeout_ms` applied to every agent step via `timeoutMs: cfg.engine.step_timeout_ms`: `src/engine/run-cycle.ts`
- Structured `step.timeout { cycle_id, step, limit_ms }` event, `formatTimeoutProofError`, and `step.timeout_salvaged`: `src/engine/run-cycle.ts`
- `result.timedOut` marking: `src/engine/exec-types.ts`

## Scope

Add an optional `timeout_ms` field resolvable at **step** and **workflow** level, layered over the existing engine default. Resolution order:

`step.timeout_ms ?? workflow.timeout_ms ?? engine.step_timeout_ms ?? built-in fallback`

Thread the resolved value into the **existing** `timeoutMs` spawn argument. Reuse all existing kill / event / salvage machinery unchanged — this is purely a config-resolution change.

## Acceptance criteria

- [ ] `Step` type accepts optional `timeout_ms`; workflow accepts an optional default `timeout_ms`.
- [ ] `loadConfig` resolves the effective per-step timeout (step → workflow → engine → fallback), mirroring the existing top-level `defaults` resolution pattern used for agent/model/thinking.
- [ ] `run-cycle` passes the resolved per-step value into the existing timeout machinery; no change to the SIGTERM/SIGKILL/kill-tree code or the `step.timeout` event shape.
- [ ] Malformed / absent / non-positive values fall back defensively (coerced at the read site), consistent with other engine numeric configs.
- [ ] Tests: step-level override beats workflow + engine; workflow default beats engine; absent → engine default; malformed → fallback; existing `step.timeout` behavior byte-for-byte unchanged.
- [ ] `docs/ENGINE.md` timeout section + the CLAUDE.md config bullet updated.

## Out of scope (explicit)

- **Idle / no-output / no-artifact-growth "stall" detection** — deliberately deferred. The original idea floated this; it adds real complexity for marginal benefit. If wanted, spike it as a separate issue. This issue is wall-clock override only.
- **Bash-step timeouts** — currently agent-only. Extend only if it falls out trivially of the same resolution path; otherwise leave for a follow-up.

Keeps the change small, agent-agnostic, and fail-loud (reuses the existing structured timeout event and clean kill).
