---
id: refl-0080-quickfix-workflow-step-order-has-no-pinn
title: Pin quickfix workflow step order with regression test in tests/defaults/
workflow: quickfix
depends_on: []
triaged_at: "2026-05-16T00:20:40.206Z"
source: triage
---
## Problem

The quickfix workflow (`plan_fix → quick_fix → test_fix`) was added to `src/defaults/workflows.yml` and `.cycle/workflows.yml` in cycle 0080, but no step-order regression test exists analogous to `tests/defaults/feature-yaml.test.ts`.

Without a pinning test, a future `sync-defaults` run or direct workflow edit could silently reorder or drop quickfix steps with no test failure.

## Background

`tests/defaults/feature-yaml.test.ts` reads `src/defaults/workflows.yml`, locates the `feature` workflow by name, and asserts `steps.map(s => s.name)` equals `["spec", "research", "plan", "build", "review", "fix", "verify", "commit", "pr", "reflection"]` (or similar pinned list). It also checks the dogfood mirror at `.cycle/workflows.yml`. This same pattern must cover the quickfix workflow.

## Required Work

Add `tests/defaults/quickfix-yaml.test.ts` that:

1. Parses `src/defaults/workflows.yml` and finds the workflow entry whose `name` is `quickfix` (or the configured name).
2. Asserts `steps.map(s => s.name)` deeply equals `["plan_fix", "quick_fix", "test_fix"]` in that exact order.
3. Repeats the same assertion against `.cycle/workflows.yml` (dogfood mirror).
4. Follows the same structural pattern as `tests/defaults/feature-yaml.test.ts` — same import style, same YAML parse approach, same describe/it shape.

## Acceptance Criteria

- [ ] `tests/defaults/quickfix-yaml.test.ts` exists and passes under `npm test`.
- [ ] Test pins step names `["plan_fix", "quick_fix", "test_fix"]` in order for `src/defaults/workflows.yml`.
- [ ] Test pins the same step order for `.cycle/workflows.yml`.
- [ ] Test fails if step names are reordered, renamed, or a step is dropped — i.e., it is a true regression guard, not a count-only check.
- [ ] `npm test` passes with no regressions in existing suites.
- [ ] Coverage does not decrease (line ≥ 95%, branch ≥ 75%, func ≥ 90%) — test-only addition so no src/ changes expected.

## Implementation Notes

- Reference: `tests/defaults/feature-yaml.test.ts` for exact pattern.
- The YAML workflow name key is likely `name: quickfix` — confirm by reading `src/defaults/workflows.yml` before writing the test.
- Both `src/defaults/workflows.yml` and `.cycle/workflows.yml` carry the quickfix definition (added in cycle 0080); both must be asserted.
- No engine source changes needed — this is a test-only addition.
