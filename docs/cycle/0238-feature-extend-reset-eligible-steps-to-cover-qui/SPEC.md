# SPEC — Cycle 0238: Extend RESET_ELIGIBLE_STEPS to Cover quick_fix, test_fix, and test_build

## Objective
`RESET_ELIGIBLE_STEPS` in `src/engine/run-cycle.ts` is hardcoded to `["build", "fix", "final_fix"]`, excluding the mutation steps used by the `quickfix` and `e2e-tests` workflows. As a result, `touched.json` is never populated for those workflows, causing `commit.scope_warning` to fire on every staged `src/` file — a permanent false-positive that degrades the signal to noise. This cycle extends the eligible set to include `quick_fix`, `test_fix`, and `test_build`, restoring accurate footprint accumulation for those workflows and silencing the spurious warnings.

## Source Issue
`refl-0227-quick-fix-and-test-build-steps-excluded` — "Extend RESET_ELIGIBLE_STEPS to cover quick_fix, test_fix, and test_build"

## Scope

### In Scope
- Add `quick_fix`, `test_fix`, and `test_build` to `RESET_ELIGIBLE_STEPS` in `src/engine/run-cycle.ts:27`
- Add regression tests confirming footprint accumulation and absence of `commit.scope_warning` for the newly eligible step names
- Check and update `ENGINE.md` if it documents `RESET_ELIGIBLE_STEPS`

### Out of Scope
- Replacing the hardcoded constant with a runtime predicate derived from workflow definitions (noted in the issue as optional; deferred)
- Changes to the `quickfix` or `e2e-tests` workflow definitions themselves
- Any changes to `commit-cycle.ts` or the `commit.scope_warning` emission logic

## Requirements
- `RESET_ELIGIBLE_STEPS` must contain `quick_fix`, `test_fix`, and `test_build` in addition to its current members
- `accumulateTouchedFiles` must be reachable for each newly eligible step name via the existing `RESET_ELIGIBLE_STEPS.has(step.name)` guard at `run-cycle.ts:394`
- The snapshot-reset guard at `run-cycle.ts:247` and the documentation-step guard at `run-cycle.ts:312` must also apply to newly eligible step names without additional changes
- Per-file line coverage for `src/engine/run-cycle.ts` must remain at or above 90%

## Acceptance Criteria
- [ ] `RESET_ELIGIBLE_STEPS` at `src/engine/run-cycle.ts:27` includes `"quick_fix"`, `"test_fix"`, and `"test_build"`
- [ ] At least one test simulates a `quick_fix` step run that mutates a `src/` file and asserts `touched.json` is non-empty afterward
- [ ] At least one test asserts that `commit.scope_warning` is NOT emitted when `touched.json` covers all staged `src/` files after a `quick_fix` step
- [ ] `npm test` passes with no failures
- [ ] `npm run test:coverage` passes and `src/engine/run-cycle.ts` line coverage is ≥ 90%
- [ ] All existing tests still pass

## Testing Strategy
- Framework: Node built-in `node:test` with `mock` — consistent with existing `tests/engine/run-cycle.test.ts`
- Key scenarios:
  - **Happy path**: run cycle with a `quick_fix` step that writes a `src/` file; assert `touched.json` written with that file's path
  - **Warning suppression**: run cycle with a `quick_fix` step whose `touched.json` covers all staged files; assert zero `commit.scope_warning` events emitted
  - **Regression guard**: confirm `test_fix` and `test_build` step names are present in `RESET_ELIGIBLE_STEPS` (unit assertion on the exported or inline set)
- No E2E tests required; existing test infrastructure (fake filesystem + event capture) is sufficient

## Documentation Updates
- **ENGINE.md**: If `RESET_ELIGIBLE_STEPS` or the footprint-accumulation logic is described, update the step-name list to include `quick_fix`, `test_fix`, and `test_build`
- **CLAUDE.md / AGENTS.md**: No changes required; `RESET_ELIGIBLE_STEPS` is an implementation detail not documented in either file

## Dependencies
- `src/engine/run-cycle.ts` — file under change; must exist at current HEAD
- `src/defaults/workflows.yml` — authoritative source for step names `quick_fix`, `test_fix`, `test_build`; read-only reference
- Existing `tests/engine/run-cycle.test.ts` test suite — new tests extend this file
