---
id: refl-0268-machine-check-detached-true-at-active-ch
source: reflection
title: machine-check detached-true at active-child spawn sites
added_at: 2026-06-07T06:10:45.979Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0268"
---

Both `killActiveChildren` (group-kill, `process.kill(-pid, sig)`) and now `anyChildAlive` (group-probe, `process.kill(-pid, 0)`, added this cycle) target the **process group** via the negated pid. Their correctness silently depends on every registered child being spawned `detached: true` so the pid is its own group leader. That invariant is documented in CLAUDE.md and honored at all three current spawn sites (exec-bash, exec-spawn, walkthrough), but it is NOT machine-checked: the cycle-0267 structural invariant validates only `registerActiveChild`/`unregisterActiveChild` pairing.

A future exec lane that satisfies the register/unregister pairing (passing the build) but omits `detached: true` would make `-pid` target the wrong group (the worker's own group) or fail — silently breaking both the reaper kill and this cycle's new liveness probe, reopening the orphaned-grandchild window. Cycle 0268 raises the cost of such a regression by adding a second consumer of the assumption.

Direction: extend the existing relational `validateActiveChildRegistration` invariant (or add a sibling entry) in `scripts/structural-invariants.mjs` to assert that each `spawn(` in a lane that registers an active child also passes `detached: true`, so a non-detached registered child fails the build loud instead of silently misbehaving at suspend time.
