---
id: refl-0066-test-fixture-helpers-duplicated-across-s
source: reflection
title: test-fixture-helpers-duplicated-across-step-end-stderr-test-files
added_at: "2026-05-15T18:55:48.688Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0066"
---

`tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` re-implements `workflowYml`, `setupRepo`, and `findStepEnd` inline because the originals in `tests/engine/run-cycle.step-end-stderr.test.ts` are not exported. REVIEW.md Finding 1 flagged this as acceptable-but-deferred. Two parallel test files now carry byte-identical fixture bodies covering the same `step.end` log-scan pattern, so any future fixture change (new field, schema bump, path move) must be made in two places.

This is distinct from the runtime helper duplication tracked by `refl-0065-extract-shared-head-capped-truncate-help` — that issue targets `src/engine/`, this one targets `tests/engine/`. Both are real but independent.

Suggested direction: extract `workflowYml` / `setupRepo` / `findStepEnd` to a shared module (e.g. `tests/engine/_step-end-fixtures.ts` or `tests/_helpers/step-end.ts`) and have both test files import from there. Low-blast-radius refactor; locks the invariant that bash- and dispatch-path tests stay shape-aligned.
