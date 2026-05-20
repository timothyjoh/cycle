---
id: refl-0195-run-cycle-forwarding-test-acs-don-t-yet
source: reflection
title: run-cycle forwarding test ACs don't yet cover the pi spy case
added_at: "2026-05-20T03:57:52.678Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0195"
---

`tests/engine/run-cycle.agent-dispatch.test.ts` verifies that `model` and `thinking` fields on a step are forwarded through `run-cycle.ts` to `runStep`. Codex has a spy case; auggie and opencode gaps were tracked as `refl-0193-run-cycle-forwarding-test-scope-should-i` and `refl-0194-run-cycle-forwarding-test-acs-don-t-yet`. Pi is now a first-class agent via the same forwarding call site but has no corresponding spy AC.

A refactor that silently drops `model`/`thinking` before calling `runStep` on a pi step would pass all current tests undetected. The fix is one AC row added to the existing run-cycle forwarding test todo file — no production source changes, no new test files.
