---
id: refl-0193-run-cycle-forwarding-test-scope-should-i
source: reflection
title: run-cycle forwarding test scope should include auggie after cycle 0193
added_at: "2026-05-20T03:08:38.750Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0193"
---

Open issue `refl-0192-run-cycle-model-thinking-forwarding-path` asks for a unit test asserting that `run-cycle.ts` properly forwards `step.model` and `step.thinking` into `runStep` — scoped to codex only.

Cycle 0193 added auggie with identical forwarding through the same `run-cycle.ts` call site. If the refl-0192 issue is implemented as-written (codex spy only), the auggie forwarding path at the run-cycle junction remains untested. A refactor that accidentally drops `model`/`thinking` before calling `runStep` on an auggie step would pass all tests undetected.

Update the acceptance criteria of `refl-0192-run-cycle-model-thinking-forwarding-path` to also include an auggie spy case before implementing it.
