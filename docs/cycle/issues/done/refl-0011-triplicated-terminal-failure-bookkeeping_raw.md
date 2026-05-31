---
id: refl-0011-triplicated-terminal-failure-bookkeeping
source: reflection
title: triplicated terminal-failure bookkeeping in cli.ts supervisor loop
added_at: 2026-05-31T19:36:06.284Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0011"
---

The new exec-failure branch in `src/cli.ts` now contains the fast-bail block and the budget-exhausted block as near-verbatim copies of the same terminal-failure bookkeeping: `terminalDrain(...)` → `consecutiveFailures += 1` → `failedCycles.push(cycleId)` → `lastHaltContext = {...}` → reset `fastFailKey`/`fastFailCount` → `if (consecutiveFailures >= maxConsecutiveFailures) { halted; haltReason; break }`. The commit-failure branch is a third near-copy of the same sequence. The review praised the fail-safe structure but did not flag the duplication.

This matters because a future change to terminal-failure accounting (a new `lastHaltContext` field, an extra counter to reset, a new halt reason) must be applied in three places and is easy to miss in one — exactly the kind of drift that produces a subtle halt-accounting bug. Direct extraction is non-trivial because each copy ends in `break` out of the `while` loop, so a future cycle should factor the shared bookkeeping into a helper returning a `{ halt: boolean }` (or a labeled-loop / sentinel) rather than copy-paste. Defer a small refactor cycle.
