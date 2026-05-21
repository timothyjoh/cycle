---
id: refl-0227-quick-fix-and-test-build-steps-excluded
title: Extend RESET_ELIGIBLE_STEPS to cover quick_fix, test_fix, and test_build
workflow: feature
depends_on: [redesign-04-footprint-json-and-scope-guard-demote]
triaged_at: "2026-05-21T14:46:03.125Z"
source: triage
---
## Problem

`RESET_ELIGIBLE_STEPS` in `src/engine/run-cycle.ts:27` is hardcoded as `["build", "fix"]`. The `quickfix` workflow uses `quick_fix` as its primary mutation step and `test_fix` for follow-up fixes; the `e2e-tests` workflow uses `test_build`. None of these appear in `RESET_ELIGIBLE_STEPS`, so no footprint is accumulated when those workflows run.

**Consequence:** every `quickfix` or `e2e-tests` commit emits `commit.scope_warning` for every staged `src/` file — `touched.json` is absent or empty. The warning is non-blocking but fires on every single commit, making the signal permanently noisy and useless for those workflows.

## Fix Strategy

Extend `RESET_ELIGIBLE_STEPS` at `src/engine/run-cycle.ts:27` to include `quick_fix`, `test_fix`, and `test_build`.

Optionally generalize: derive the eligible set from workflow definitions (any step whose agent is not `bash` and not a verify-type step) rather than maintaining a hardcoded list. If generalizing, the constant should be replaced with a predicate that reads registered workflow step names at runtime.

## Implementation Steps

1. Add `quick_fix`, `test_fix`, and `test_build` to `RESET_ELIGIBLE_STEPS` in `src/engine/run-cycle.ts`.
2. Confirm `accumulateTouchedFiles` is invoked for each newly eligible step type via the existing step-name check.
3. Add regression tests: a `quickfix`-workflow run that touches `src/` files must produce a non-empty `touched.json`; assert no spurious `commit.scope_warning` fires when footprint is present.
4. Check `ENGINE.md` and `CLAUDE.md` for any documentation of `RESET_ELIGIBLE_STEPS` and update accordingly.

## Acceptance Criteria

- `RESET_ELIGIBLE_STEPS` (or its successor predicate) includes `quick_fix`, `test_fix`, and `test_build`.
- A `quickfix` or `e2e-tests` run that mutates `src/` files produces a non-empty `touched.json` and does not emit `commit.scope_warning` for those files.
- `src/engine/run-cycle.ts` per-file line coverage stays at or above the 90% floor.
- At least one regression test covers `quick_fix` footprint accumulation end-to-end.
