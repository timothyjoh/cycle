---
id: refl-0268-machine-check-detached-true-at-active-ch
title: Machine-check detached:true at every active-child spawn site
workflow: feature
depends_on: []
triaged_at: 2026-06-07T06:13:51.420Z
source: triage
priority: medium
---
Both `killActiveChildren` (group-kill, `process.kill(-pid, sig)`) and now `anyChildAlive` (group-probe, `process.kill(-pid, 0)`, added in cycle 0268) target the **process group** via the negated pid. Their correctness silently depends on every registered active child being spawned `detached: true` so the pid is its own group leader. That invariant is documented in CLAUDE.md and honored at all three current spawn sites (`exec-bash.ts`, `exec-spawn.ts`, `walkthrough.ts`), but it is NOT machine-checked: the cycle-0267 structural invariant (`validateActiveChildRegistration`) validates only the `registerActiveChild`/`unregisterActiveChild` pairing.

## Problem

A future exec lane that satisfies the register/unregister pairing (and therefore passes the build) but omits `detached: true` would make `-pid` target the wrong group (the worker's own group) or fail outright — silently breaking both the reaper kill and cycle 0268's new liveness probe, reopening the orphaned-grandchild window at suspend time. Cycle 0268 raised the cost of such a regression by adding a second consumer of the assumption.

## Direction

Extend the existing relational `validateActiveChildRegistration` invariant (or add a sibling relational entry per `exec-*.ts` lane) in `scripts/structural-invariants.mjs` so that each `spawn(` in a lane that registers an active child is asserted to also pass `detached: true`. A registered-but-non-detached child must fail `npm run check:invariants` loud at build time instead of silently misbehaving when a SIGTERM/SIGINT suspend arrives.

## Scope / acceptance

- The invariant fails the build if any active-child-registering exec lane spawns without `detached: true`.
- Non-spawning lanes pass vacuously, mirroring the existing register/unregister predicate.
- A new lane is covered by the same per-lane registration mechanism (no second hand-maintained list).
- All three current spawn sites continue to pass.
- Cover the new predicate branches via `tests/scripts/structural-invariants.test.ts` (drive the real containment branches in-process per the import-safe module contract).
- Update CLAUDE.md's structural-invariants and "adding an agent" notes to record the new `detached:true` check alongside the active-child-registration entry.
