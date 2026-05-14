---
id: refl-0041-find-prior-build-head-sha-wrapper-is-dea
source: reflection
title: find-prior-build-head-sha-wrapper-is-dead-code-in-src
added_at: "2026-05-14T04:04:06.496Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0041"
---

Cycle 0041 generalized `findPriorBuildHeadSha` to `findPriorStepHeadSha(repoRoot, cycleId, stepName)` and kept `findPriorBuildHeadSha` as a one-line wrapper (`src/engine/run-cycle.ts:49`). A grep of `src/` shows zero production callers — the only importers are `tests/engine/run-cycle.test.ts` (four wrapper-specific unit tests) and the wrapper's own export line. The wrapper exists solely to keep those tests green.

This is a small but real form of API rot: future readers will assume the wrapper is on a real call path and preserve it through refactors. Either delete the wrapper and rewrite its four tests to call `findPriorStepHeadSha(root, cycleId, 'build')` (test intent is identical, just renamed), or — if we want to keep a public-API alias — add a `@deprecated` JSDoc tag and a one-line comment naming the planned removal.

Low priority; cleanup, not correctness. Worth folding into whichever next cycle touches `run-cycle.ts` so it does not become permanent furniture.
