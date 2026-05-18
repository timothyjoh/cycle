# SPEC — Cycle 0151: Add Workflow-Shape-Mutation Checklist to research.md

## Objective
This cycle adds a targeted checklist item to `src/defaults/prompts/research.md` that fires whenever a cycle's spec indicates the diff will touch `src/defaults/workflows.yml`. The checklist instructs the research agent to grep `tests/defaults/` and `tests/engine/` for hard-coded step counts, exact step-name array literals, and `.length` assertions on `workflow.steps`, and to list every match as a task to update. This is the low-cost, high-leverage approach (#1 from the issue) that eliminates the class of missed-update bug that hit cycle 0052 when the `documentation` step landed.

## Source Issue
`refl-0052-research-pass-doesnt-enumerate-step-coun` — "Add workflow-shape-mutation checklist to research.md so step-count parity tests are surfaced before BUILD"

## Scope

### In Scope
- Add a conditional workflow-shape-mutation section to `src/defaults/prompts/research.md` instructing the research agent to enumerate tests that pin step count or step-name sequence when `src/defaults/workflows.yml` is in scope.
- Sync the updated prompt to `.cycle/` via `npm run sync-defaults`.
- Add a regression test verifying that the checklist text appears in the deployed prompt.

### Out of Scope
- Approach #2 (export a single canonical step-name array and rewrite tests to loop over it) — deferred to a follow-up cycle.
- Generalizing the checklist to non-`workflows.yml` mutations (prompt-only edits, script-only edits).
- Retroactively rewriting historical RESEARCH.md outputs.

## Requirements
- `src/defaults/prompts/research.md` must contain a new section that, when the cycle diff is expected to touch `src/defaults/workflows.yml`, instructs the research agent to search `tests/defaults/` and `tests/engine/` for: hard-coded step-count assertions (`steps.length`, `.length === N`), exact step-name array literals, and `deepEqual`/`equal` comparisons against named step sequences.
- Every match found must be listed as a named task in RESEARCH.md so the planner carries it forward.
- The sync command must propagate the change to `.cycle/prompts/research.md`.
- Existing tests must continue to pass after the change.

## Acceptance Criteria
- [ ] `src/defaults/prompts/research.md` contains a "Workflow Shape Mutation" (or equivalent) section with grep instructions for step-count and step-name assertions.
- [ ] `.cycle/prompts/research.md` reflects the same change (sync applied).
- [ ] A test in `tests/defaults/` asserts the checklist text is present in the deployed prompt file.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).
- [ ] Coverage does not decrease vs master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).

## Testing Strategy
- Node built-in test runner (`node:test`) — matches all existing tests in `tests/defaults/`.
- Add `tests/defaults/research-prompt-workflow-shape.test.ts` (or extend an existing file): read `src/defaults/prompts/research.md`, assert the workflow-shape-mutation checklist section is present, assert key grep instruction terms appear (e.g., `workflows.yml`, `steps.length`, `tests/defaults/`).
- Verify sync: the same assertions can run against `.cycle/prompts/research.md` to confirm `sync-defaults` was applied.
- No UI or E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No command or convention changes needed; this is a prompt-only addition.
- **README.md**: No user-facing change.

Documentation is part of "done" — the prompt change itself is the deliverable; the test is its documentation.

## Dependencies
- `src/defaults/prompts/research.md` already exists and is the file being modified.
- `npm run sync-defaults` already propagates `src/defaults/` → `.cycle/` — no new tooling required.
- `tests/defaults/` test infrastructure already established by `feature-yaml.test.ts` and `feature-loadable.test.ts`.
