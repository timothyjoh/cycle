---
id: refl-0194-run-cycle-forwarding-test-acs-don-t-yet
source: reflection
title: run-cycle forwarding test ACs don't yet include opencode spy case
added_at: "2026-05-20T03:34:17.718Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0194"
---

`refl-0193-run-cycle-forwarding-test-scope-should-i` (already queued) amends the run-cycle forwarding test issue to add an auggie spy AC alongside the codex spy. opencode is now also first-class and uses the same `run-cycle.ts` forwarding call site, but it is not named in either `refl-0192-run-cycle-model-thinking-forwarding-path` or the refl-0193 amendment issue.

A refactor that silently drops `model`/`thinking` before calling `runStep` on an opencode step would pass all current tests undetected. The fix is additive: amend `refl-0192-run-cycle-model-thinking-forwarding-path` (or the amendment issue) to add an explicit opencode spy AC, before that issue is implemented.

This is the same pattern as the auggie amendment — one more AC row in the todo file, no production code change.
