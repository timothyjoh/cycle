---
id: refl-0031-workflow-agent-dispatch-only-end-to-end
source: reflection
title: workflow-agent-dispatch-only-end-to-end-tested-for-claudecode
added_at: "2026-05-13T22:21:30.602Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0031"
---

Cycle 0031 adds the third registered exec provider (`gemini`), but every shipped step in `src/defaults/workflows.yml` and `.cycle/workflows.yml` still uses `agent: claudecode` (or `agent: bash`). `tests/engine/exec.test.ts` covers `resolveAgent("codex"/"gemini")` registry presence and the per-module unit tests in `tests/engine/exec-{codex,gemini}.test.ts` exercise each `runStep` directly, but no test reaches `resolveAgent` through `src/engine/workflow.ts` for any non-claudecode agent. A regression in `workflow.ts → resolveAgent` step dispatch (e.g. wrong arg threading, env propagation, prompt-path resolution) that only manifests for codex/gemini would ship green.

This matters because the multi-agent abstraction's whole point is to let a future cycle flip a step to `agent: gemini` (or codex). The first such flip will be the first end-to-end exercise of the dispatch path — exactly the wrong moment to discover a workflow-layer bug.

Suggested direction: add a `tests/engine/workflow.test.ts` (or extend an existing workflow test) that runs a one-step fake workflow through `runCycle` / `workflow.ts` with `agent: codex` (or `gemini`), backed by the same fake-binary-on-PATH pattern the per-module tests already use. One test that proves dispatch round-trips through `workflow.ts` for a non-claudecode agent is enough to lock the contract.
