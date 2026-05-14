---
id: multi-agent-abstraction-exec-gemini
title: "Engine: exec-gemini.ts provider module"
workflow: feature
depends_on: [multi-agent-abstraction-exec-interface]
triaged_at: "2026-05-13T18:14:39.363Z"
source: triage
parent: multi-agent-abstraction
---
## Why

With the exec-module interface + dispatch table in place (see `multi-agent-abstraction-exec-interface`), add a `gemini` provider so workflows can declare `agent: gemini` per step.

## Scope

- New file `src/engine/exec-gemini.ts` implementing the exec-module contract. Mirror the shape of `src/engine/exec-claudecode.ts`: takes the same args, returns `{stdout, exit}`.
- Spawn the gemini CLI via `spawn` with array args (no `exec`, no `shell: true`), inheriting the curated PATH from `src/engine/child-env.ts`. Pass the prompt on stdin, capture stdout/stderr, return on exit. Match the env + cwd + log handling of the claudecode module.
- Register the module in the dispatch table from the interface ticket so `agent: gemini` in `workflows.yml` resolves correctly.
- Tests use mocked subprocesses (the existing claudecode tests are the template): assert the spawn was invoked with the right binary + args, that stdin received the prompt, that stdout is returned verbatim, and that a non-zero exit propagates as a step failure.

## Acceptance

- `exec-gemini.ts` exists and exports the exec-module contract.
- Dispatch table includes `gemini`.
- A workflow step with `agent: gemini` runs through the gemini module end-to-end in tests.
- Mocked-subprocess unit tests cover the happy path and a non-zero exit path.
- Coverage thresholds hold.

## Non-goals

- No provider-specific quirks beyond basic input/output parity with claudecode.
- No changes to the claudecode path.
- No real gemini CLI invocation in tests — subprocesses are mocked.
