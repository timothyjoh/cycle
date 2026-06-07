---
id: refl-0265-guard-exec-lane-active-child-registratio
source: reflection
title: guard exec-lane active-child registration with a structural invariant
added_at: 2026-06-07T03:49:06.472Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0265"
---

Cycle 0265 fixes the orphan-leak on suspend by having every in-process step lane register its group-leader PID in the new `active-child` registry (`exec-spawn.ts` and `exec-bash.ts` call `registerActiveChild`/`unregisterActiveChild`), which `run-one`'s signal handler reaps. This pairing is entirely manual. CLAUDE.md already warns that agent-fleet consistency across `exec-*.ts` is unguarded — a new agent lane that spawns a child but forgets to register/unregister it (or omits `detached: true`) would silently reintroduce exactly the orphaned-mutating-process bug this cycle eliminated, with no test or gate catching it.

Add a build-time structural invariant (`scripts/structural-invariants.mjs`) asserting every `exec-*.ts` lane that calls `spawn(` also calls `registerActiveChild` and `unregisterActiveChild`. This turns a safety-critical, easy-to-forget convention into a fail-loud gate, matching the existing agent-binary-hermeticity invariants.
