---
id: refl-0035-e2e-tests-research-phase-no-op-is-docume
source: reflection
title: e2e-tests research-phase no-op is documented in-scope but untested
added_at: 2026-06-03T03:43:38.847Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0035"
---

The MUST-FIX resolution took the doc-correction path: CLAUDE.md and `docs/ENGINE.md` now assert the research-phase short-circuit fires for *any* workflow's `research` step (explicitly naming `e2e-tests`), matching the name-keyed `step.name === "research"` gate. But REVIEW.md Finding 5 / the missing-tests note records that no test exercises an `e2e-tests` `research` marker — the entire suite drives the `feature` workflow. The cross-workflow behavior the docs now claim has zero test backing.

Add a regression test (extending `tests/engine/noop-resolution.test.ts`) that an `e2e-tests` `research` step writing a valid `NOOP.md` short-circuits to `cycle.noop { detected_at_step: "research" }`. This locks in the documented behavior and prevents a future workflow-gating change from silently contradicting the docs again — the same doc-vs-code drift that triggered this cycle's only MUST-FIX.
