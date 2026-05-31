---
id: refl-0011-triplicated-terminal-failure-bookkeeping
title: Extract triplicated terminal-failure bookkeeping in cli.ts supervisor
  loop into a shared helper
workflow: feature
depends_on: []
triaged_at: 2026-05-31T19:40:42.311Z
source: triage
priority: medium
---
The exec-failure branch in `src/cli.ts` now carries three near-verbatim copies of the same terminal-failure bookkeeping sequence: the fast-bail block, the budget-exhausted block, and the commit-failure block. Each copy performs the identical steps:

- `terminalDrain(...)`
- `consecutiveFailures += 1`
- `failedCycles.push(cycleId)`
- `lastHaltContext = {...}`
- reset `fastFailKey` / `fastFailCount`
- `if (consecutiveFailures >= maxConsecutiveFailures) { halted; haltReason; break }`

## Why this matters

The duplication is a drift hazard: any future change to terminal-failure accounting — a new `lastHaltContext` field, an extra counter to reset, a new halt reason — must be applied in all three places, and missing one produces a subtle, hard-to-spot halt-accounting bug. The recent review praised the fail-safe structure but did not flag the copy-paste.

## Scope

Factor the shared terminal-failure bookkeeping into a single helper and route all three call sites through it. Direct extraction is non-trivial because each copy ends in `break` out of the `while` loop, so the helper should return a decision (e.g. `{ halt: boolean }`) that the supervisor inspects to decide whether to `break`, rather than burying control flow inside the helper. A labeled-loop or sentinel-return shape is an acceptable alternative if it reads more cleanly.

This is a refactor with no intended behavior change: the halt/accounting semantics (counter increments, `failedCycles` tracking, `lastHaltContext` contents, fast-fail reset, `max_consecutive_failures` threshold, halt reasons) must be exactly preserved. Existing supervisor / halt-accounting tests must continue to pass; add focused coverage asserting all three failure paths share the same bookkeeping (including the exactly-once `engine.halted` semantics) so a future divergence is caught.

Keep the change small and self-contained — this was queued as a deferred low-urgency refactor cycle.
