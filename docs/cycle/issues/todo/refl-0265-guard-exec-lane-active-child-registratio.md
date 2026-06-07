---
id: refl-0265-guard-exec-lane-active-child-registratio
title: Guard exec-lane active-child registration with a structural invariant
workflow: feature
depends_on: []
triaged_at: 2026-06-07T03:57:20.301Z
source: triage
priority: medium
---
Cycle 0265 fixed the orphan-process leak on suspend by having every in-process step lane register its group-leader PID in the new `active-child` registry: `src/engine/exec-spawn.ts` and `src/engine/exec-bash.ts` call `registerActiveChild`/`unregisterActiveChild`, which `run-one`'s signal handler reaps. This pairing is entirely manual and currently ungated. CLAUDE.md already warns that agent-fleet consistency across `exec-*.ts` is unguarded — a new agent lane that spawns a child but forgets to register/unregister it (or omits `detached: true`) would silently reintroduce the orphaned-mutating-process bug this cycle eliminated, with no test or gate catching it.

Add a build-time structural invariant in `scripts/structural-invariants.mjs` asserting that every `exec-*.ts` lane which calls `spawn(` also calls both `registerActiveChild` and `unregisterActiveChild`. Use a relational/predicate (`validate`-style) entry that inspects each `exec-*.ts` file (or the relevant set), so the build fails loud when a spawning lane is missing either registry call. This turns a safety-critical, easy-to-forget convention into a fail-loud gate, matching the existing agent-binary-hermeticity invariants.

Scope: extend the `INVARIANTS` table only; reuse the existing `runInvariants` dispatch and in-process test harness (`tests/scripts/structural-invariants.test.ts`) to cover both the pass and fail branches of the new entry. Do not change exec-lane runtime behavior. Honor the project's agnostic / simple / resilient / fail-loud principles — the invariant should be the minimal structural check that catches the omission, not a broad rewrite.
