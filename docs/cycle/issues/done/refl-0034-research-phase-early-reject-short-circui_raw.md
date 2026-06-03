---
id: refl-0034-research-phase-early-reject-short-circui
source: reflection
title: research-phase early-reject short-circuit deferred but unfiled
added_at: 2026-06-03T02:56:51.236Z
triage_attempts: 0
priority: high
origin_cycle_id: "0034"
---

The source issue `txt-20260601-220000-noop-already-satisfied-rejection-path` scoped **two** detection points: a research-phase early rejection (explicitly marked the *primary* path, `priority: high`) that short-circuits before plan/build/review run, and a build-phase fallback. Cycle 0034 shipped only the build-phase fallback; BUILD.md defers the research-phase short-circuit to a "sibling cycle" but no separate issue exists for it. When the source issue drains to `done/` after this cycle, the primary half of its scope is silently lost.

The research-phase reject is the higher-value half: it resolves a moot issue *before* spending spec/plan/build agent budget, whereas the shipped fallback only catches it after build runs. File a follow-up: have the research step emit a `NOOP.md` reject marker (same reason-category + file:line-evidence schema as build) and add an engine intercept after the research step that short-circuits to the existing `cycle.noop` terminal outcome, reusing `classifyNoopMarker` and `noopDrain`.
