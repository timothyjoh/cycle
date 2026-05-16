---

# SPEC — Cycle 0107: Add Pinning Test for Dogfood .cycle/workflows.yml Feature Workflow

## Objective
Add a test file that pins the step order and local-divergence invariants of the dogfood `.cycle/workflows.yml` feature workflow. Without this test, a stray `npm run sync-defaults` or manual edit can silently revert the trunk-based divergences (no_branch, commit-trunk.sh, no pr step) or reorder steps — and no existing test would catch it.

## Source Issue
`refl-0081-dogfood-cycle-workflows-yml-feature-step` — "Add pinning test for dogfood .cycle/workflows.yml feature step order and local divergence invariants"

## Scope

### In Scope
- New test file `tests/dogfood/feature-yaml.test.ts` that reads `.cycle/workflows.yml` and asserts the feature workflow's step sequence and local-divergence invariants.
- Assert that `reflection` step (if present) appears before `commit`, OR pin exact current step sequence — whichever reflects actual file state at implementation time (research step must confirm current `.cycle/workflows.yml` step list).

### Out of Scope
- Adding or reordering steps in `.cycle/workflows.yml` — this cycle does not modify the workflow definition itself.
- Testing any workflow other than `feature` within `.cycle/workflows.yml`.
- Changes to `src/defaults/workflows.yml` or its existing tests.

## Requirements
- Test reads `.cycle/workflows.yml` via `fs.readFileSync` + `yaml` package (already a dev dependency, imported as `YAML` from `"yaml"`).
- Test finds the `feature` workflow entry by `name` field.
- Test asserts the full ordered step name sequence via `assert.deepEqual` to act as regression guard.
- Test asserts `no_branch: true` is present on the feature workflow object.
- Test asserts at least one step has a `command` field containing the string `commit-trunk.sh`.
- Test asserts no step has `name: "pr"` in the feature workflow.
- If `reflection` step exists in the file at implementation time: test asserts `indexOf("reflection") < indexOf("commit")`.

## Acceptance Criteria
- [ ] `tests/dogfood/feature-yaml.test.ts` exists and is picked up by `npm test`.
- [ ] Test pins the complete feature workflow step sequence (deepEqual guard).
- [ ] Test asserts `no_branch: true` on the dogfood feature workflow.
- [ ] Test asserts a step referencing `commit-trunk.sh` is present.
- [ ] Test asserts no step named `pr` exists in the feature workflow.
- [ ] If `reflection` step is present: test asserts its index is less than the index of `commit`.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.
- [ ] Coverage does not regress (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Testing Strategy
- Framework: Node built-in `node:test` + `node:assert` — matches all other test files in this repo.
- Mirror structure of `tests/defaults/feature-yaml.test.ts` exactly: same imports, same `test()` shape.
- Two `test()` blocks: one for step sequence (deepEqual), one for local-divergence invariants.
- No mocking; reads real `.cycle/workflows.yml` from working directory.
- Run `npm test` to confirm full suite passes end-to-end.

## Documentation Updates
- **CLAUDE.md**: No command table changes required; new test file discovered automatically by test runner.
- **README.md**: No user-facing change.

## Dependencies
- `yaml` package already installed as dev dependency.
- `.cycle/workflows.yml` must exist (confirmed checked in to repo).
- `tests/dogfood/` directory does not yet exist — create it.
