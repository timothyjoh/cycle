---
id: multi-agent-abstraction-exec-interface
title: "Engine: exec-module interface + agent dispatch table"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:14:39.363Z"
source: triage
parent: multi-agent-abstraction
---
## Why

`workflows.yml` declares `agent: <name>` per step and per triage, but the engine only knows how to run `claudecode`. To support `codex`, `gemini`, and future agents without scattering conditionals, introduce a single exec-module interface and a dispatch table that maps the `agent` string to a concrete implementation.

This ticket lands the abstraction; provider modules (`exec-codex`, `exec-gemini`) come in follow-up tickets and just plug into the table.

## Scope

- Define the exec-module shape in `src/engine/exec.ts` (or equivalent): a single `runStep({prompt, tools, env, cwd, log, ...}) -> {stdout, exit}` contract that all providers conform to. Keep the existing `exec-claudecode.ts` call-sites working.
- Refactor `src/engine/exec-claudecode.ts` so it conforms to that interface (rename / reshape exports as needed, no behavior change).
- Add a dispatch function (e.g. `resolveAgent(name: string): ExecModule`) backed by a `Record<string, ExecModule>` table. `claudecode` is the only entry initially.
- Update every call-site that currently imports `exec-claudecode` directly (step runner, triage subroutine, reflection if applicable) to go through the dispatch instead. The agent name comes from the per-step `agent:` field in `workflows.yml`, falling back to a workflow-level or engine-level default if already wired that way — preserve existing fallback semantics.
- Unknown agent name: throw a clear, named error (e.g. `UnknownAgentError: agent "foo" is not registered; known agents: claudecode`). No silent fallback to claudecode. Surface the failure as a normal step failure with the error message in the log event.

## Acceptance

- New interface file exported and consumed by `exec-claudecode.ts`.
- Dispatch table lives in one place; adding a new agent is a one-line registration.
- All existing tests still pass with no behavior change for the `claudecode` path.
- New unit test: dispatch returns the registered module for `claudecode`.
- New unit test: dispatch throws `UnknownAgentError` for an unregistered name, with the unknown name and the list of known names in the message.
- Coverage thresholds hold (line ≥95%, branch ≥75%, function ≥90%).

## Non-goals

- No new provider implementations in this ticket — they are separate children of the same raw.
- No changes to `workflows.yml` schema; the `agent:` field already exists.
- No provider-specific quirks beyond what's needed to make the interface coherent.
