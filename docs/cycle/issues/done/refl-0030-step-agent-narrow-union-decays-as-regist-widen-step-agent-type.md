---
id: refl-0030-step-agent-narrow-union-decays-as-regist-widen-step-agent-type
title: Widen Step.agent type to match runtime registry (workflow.ts)
workflow: quickfix
depends_on: []
triaged_at: "2026-05-13T22:09:56.979Z"
source: triage
parent: refl-0030-step-agent-narrow-union-decays-as-regist
---
## Problem

`src/engine/workflow.ts:7` types `Step.agent` as the narrow union `"claudecode" | "bash"`. The runtime dispatcher (`resolveAgent` in `src/engine/exec.ts`) accepts any registered agent string, and `loadConfig` force-casts parsed YAML into the narrow type. With `codex` now registered (cycle 0030) and `gemini` queued (`multi-agent-abstraction-exec-gemini`), the type lies at two sites today and three soon. Cycle 0030's RESEARCH.md, BUILD.md, and REVIEW.md each flagged this as a deliberately-punted latent inconsistency.

## Goal

Keep the compile-time type honest as the agent registry grows, without forcing a manual edit per new provider.

## Direction

Preferred: derive `Step.agent` from `keyof typeof REGISTRY` (or an equivalent registry-derived type) in `src/engine/exec.ts`, then import that type in `src/engine/workflow.ts`. Acceptable fallback: widen `Step.agent` to `string` and rely on `resolveAgent`'s `UnknownAgentError` for unknown values at runtime.

## Scope

- `src/engine/workflow.ts` — `Step.agent` type definition + any narrow-union assumptions in `loadConfig`.
- `src/engine/exec.ts` — export a registry-derived agent-name type if going the keyof-typeof route.
- Tests under `tests/engine/` that pattern-match the union (likely `workflow.test.ts`, possibly `exec.test.ts`) — update expectations to match the new shape.
- Verify `workflows.yml` defaults still type-check after the change.

## Acceptance

- A `workflows.yml` step with `agent: codex` (and a hypothetical `agent: gemini` once that lands) type-checks cleanly without per-provider edits to `workflow.ts`.
- An unregistered agent name still fails — via `UnknownAgentError` at runtime if the type is `string`, or at compile time if the type is registry-derived.
- `npm run typecheck` passes; full test suite passes; coverage holds the master baseline (line ≥ 95% / branch ≥ 75% / function ≥ 90%).

## Non-goals

- Implementing `gemini` (separate cycle: `multi-agent-abstraction-exec-gemini`).
- Refactoring the ExecModule prompt contract (separate cycle: `refl-0029-execmodule-promptpath-contract-leaks-on`).
- Extracting a shared `runAgent` helper across provider modules (separate cycle: `refl-0030-exec-provider-modules-converging-on-copy`).
