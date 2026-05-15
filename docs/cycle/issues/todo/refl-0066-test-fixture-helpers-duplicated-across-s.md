---
id: refl-0066-test-fixture-helpers-duplicated-across-s
title: Extract shared step-end-stderr test fixture helpers (workflowYml/setupRepo/findStepEnd) to a single module
workflow: feature
depends_on: []
triaged_at: "2026-05-15T19:00:13.653Z"
source: triage
---
## Context

`tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` re-implements `workflowYml`, `setupRepo`, and `findStepEnd` inline because the originals in `tests/engine/run-cycle.step-end-stderr.test.ts` are not exported. REVIEW.md Finding 1 from cycle 0066 flagged this as acceptable-but-deferred. Two parallel test files now carry byte-identical fixture bodies covering the same `step.end` log-scan pattern, so any future fixture change (new field, schema bump, path move) has to be made in two places — risking shape drift between the bash-path and dispatch-path coverage.

Distinct from `refl-0065-extract-shared-head-capped-truncate-help` (runtime helper in `src/engine/`); this issue targets `tests/engine/`.

## Goal

Land a single shared test-helper module that both `run-cycle.step-end-stderr.test.ts` and `run-cycle.step-end-stderr-dispatch.test.ts` import from, eliminating the byte-identical duplication.

## Acceptance

1. Shared module exists (suggested: `tests/engine/_step-end-fixtures.ts` or `tests/_helpers/step-end.ts`) exporting `workflowYml`, `setupRepo`, `findStepEnd` with the same signatures the two test files currently use inline.
2. Both `tests/engine/run-cycle.step-end-stderr.test.ts` and `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` import the helpers from the shared module — no inline re-declarations of any of the three names remain in either file.
3. `grep -n 'function workflowYml\|function setupRepo\|function findStepEnd' tests/engine/run-cycle.step-end-stderr*.test.ts` returns zero matches after the change.
4. `npm test` passes (both test files green, no other regressions).
5. `npm run typecheck` passes — no warnings.
6. Coverage gates per CLAUDE.md hold (line ≥ 95%, branch ≥ 75%, func ≥ 90%; `triage.ts` per-file floor unchanged).

## Out of scope

- Refactoring the runtime stderr-truncate helper (tracked separately by `refl-0065-extract-shared-head-capped-truncate-help`).
- Restructuring the two test files' scenario coverage — only the helper bodies move.
- Adding new test cases beyond what's needed to keep the suite green.

## Notes

- Low-blast-radius refactor; locks the invariant that bash- and dispatch-path step.end stderr tests stay shape-aligned.
- Pick whichever location (`tests/engine/_step-end-fixtures.ts` vs `tests/_helpers/step-end.ts`) better matches existing test-helper conventions in this repo — check for prior art before placing the file.
