---
id: refl-0081-dogfood-cycle-workflows-yml-feature-step
title: Add pinning test for dogfood .cycle/workflows.yml feature step order and local divergence invariants
workflow: feature
depends_on: []
triaged_at: "2026-05-16T00:41:57.149Z"
source: triage
---
## Problem

`tests/defaults/feature-yaml.test.ts` reads only `src/defaults/workflows.yml`. No test pins the step order in `.cycle/workflows.yml`. Once the reflection-before-commit reorder lands on the dogfood file (cycle 0082), it can silently drift back without any test failing.

This is parallel to `refl-0080-quickfix-workflow-step-order-has-no-pinn` (quickfix workflow in `src/defaults/`); this issue targets the dogfood feature workflow in `.cycle/workflows.yml`.

## What to build

Add `tests/dogfood/feature-yaml.test.ts` (or a `describe` block in an existing dogfood test suite) that:

1. Reads `.cycle/workflows.yml` via `fs.readFileSync` + `js-yaml.load` (already a dev dependency).
2. Finds the `feature` workflow entry.
3. Asserts the step sequence (by `name` field) matches the correct post-reorder order — specifically that the step named `reflection` appears before the step named `commit`.
4. Asserts the LOCAL DIVERGENCE invariants that distinguish `.cycle/workflows.yml` from `src/defaults/workflows.yml`:
   - `no_branch: true` is present on the feature workflow.
   - A step whose `run` or `script` field references `commit-trunk.sh` is present.
   - No step named `pr` exists in the feature workflow steps.

## Reference

Mirror the structure of `tests/defaults/feature-yaml.test.ts` but target `.cycle/workflows.yml` and add the three local-divergence assertions. The divergence invariants are what make this test distinct — and what prevent a stray `npm run sync-defaults` from silently clobbering the dogfood-specific shape (the 0046 incident).

## Acceptance criteria

- New test file or block under `tests/` covers `.cycle/workflows.yml` feature workflow step names in order.
- Test asserts index of `reflection` step < index of `commit` step.
- Test asserts `no_branch: true` on the dogfood feature workflow.
- Test asserts a step referencing `commit-trunk.sh` is present and no step named `pr` exists.
- `npm test` passes with all new assertions included.
- No existing tests broken.
- Coverage does not regress (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
