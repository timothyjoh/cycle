---
id: refl-0031-workflow-agent-dispatch-only-end-to-end
title: Cover non-claudecode agent dispatch through workflow.ts with end-to-end test
workflow: feature
depends_on: []
triaged_at: "2026-05-13T22:23:03.226Z"
source: triage
---
## Context

Cycle 0031 added `gemini` as the third registered exec provider (`claudecode`, `codex`, `gemini`). Coverage today:

- `tests/engine/exec.test.ts` — asserts `resolveAgent("codex"|"gemini")` registry presence + `UnknownAgentError` shape.
- `tests/engine/exec-codex.test.ts`, `tests/engine/exec-gemini.test.ts` — exercise each module's `runStep` directly with a fake binary on PATH.

Gap: no test reaches `resolveAgent` through `src/engine/workflow.ts` for any non-`claudecode` agent. Every step in `src/defaults/workflows.yml` and `.cycle/workflows.yml` still uses `agent: claudecode` (or `agent: bash`), so `workflow.ts → resolveAgent` dispatch is only ever exercised end-to-end against `claudecode`.

A regression in `workflow.ts` dispatch (wrong arg threading, env propagation, prompt-path resolution, working-dir handling) that only manifests for codex/gemini would ship green today. First time anyone flips a real step to `agent: gemini` or `agent: codex` will be the first end-to-end exercise of that path — exactly the wrong moment to discover a workflow-layer bug.

## Acceptance

1. Add `tests/engine/workflow.test.ts` (or extend an existing workflow-level test) that runs a one-step fake workflow through `runCycle` / `workflow.ts` with `agent: codex` **and** `agent: gemini`, backed by the fake-binary-on-PATH pattern already used in `tests/engine/exec-codex.test.ts` and `tests/engine/exec-gemini.test.ts`.
2. Test asserts the fake binary was invoked with the workflow-layer-provided args/env/cwd/prompt path that `runStep` expects from each module, and that `step.end status:ok` lands on `.cycle/log.jsonl`.
3. Test would fail if `workflow.ts` regressed to (a) only dispatch through `claudecodeExec`, (b) pass the wrong arg/env, or (c) skip prompt-path resolution for non-claudecode agents.
4. Existing per-module unit tests stay; this is the missing integration seam, not a replacement.
5. Coverage report at end of cycle shows `src/engine/workflow.ts` branch coverage non-regressing.

## Out of scope

- Flipping any real shipped workflow step to `agent: codex` / `agent: gemini` (separate decision).
- Reworking the `ExecModule.promptPath` contract — tracked separately under `refl-0029-execmodule-promptpath-contract-leaks-on`.
- Extracting a shared `runAgent` helper — tracked separately under `refl-0030-exec-provider-modules-converging-on-copy`.

## Notes

Fake-binary-on-PATH pattern is established. Re-use the prepended-PATH shim and a tiny shell script that records argv/env to a temp file, then assert on that file from the test.
