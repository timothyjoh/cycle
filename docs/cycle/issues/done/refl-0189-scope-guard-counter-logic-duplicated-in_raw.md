---
id: refl-0189-scope-guard-counter-logic-duplicated-in
source: reflection
title: Scope-guard counter logic duplicated in drain loop and runResumeOnce
added_at: "2026-05-20T01:31:29.267Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0189"
---

The 12-line block that increments `scopeGuardViolations`, emits `engine.paused`, and returns/breaks on `count >= 2` appears twice verbatim in `src/cli.ts`: once inside `runResumeOnce` (around line 364) and once in the main `while (!halted)` drain loop (around line 480). The deletion on successful commit is similarly duplicated.

If the threshold, event shape, or reset semantics ever change, both sites must be updated in sync. A helper function (e.g., `checkScopeGuardViolation(cycleId, blockedFiles): boolean`) would eliminate the duplication and make the invariant easier to test in isolation.
