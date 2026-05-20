---
id: refl-0192-run-cycle-model-thinking-forwarding-path
source: reflection
title: run-cycle model/thinking forwarding path has no unit test
added_at: "2026-05-20T02:43:45.409Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0192"
---

The exec-codex tests verify the exec layer in isolation, and the workflow tests verify YAML round-tripping. But the junction at `run-cycle.ts:288` — where `step.model` and `step.thinking` are forwarded into `mod.runStep()` — has no dedicated assertion. A refactor that accidentally drops these fields would pass all existing tests.

A run-cycle unit test should spy on `runStep` and assert that a step with `model: o4-mini` and `thinking: high` results in a `runStep` call with those values populated. This closes the gap between the two currently-tested layers.
