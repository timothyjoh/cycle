# SPEC — Cycle 0252: Document Workflow Missing Prompt Files

## Objective

The `document` workflow is advertised as a shipped workflow in the README but is completely broken: its three agent steps reference prompt files that do not exist in `src/defaults/prompts/`. Any attempt to run a `document` workflow cycle fails immediately when the engine tries to load the missing prompt. This cycle delivers the three missing prompt files (`plan_documents.md`, `authoring.md`, `review_documents.md`), removes the dead `verify.md` file that no workflow step loads, and syncs the changes to `.cycle/prompts/` so the running engine picks them up.

## Source Issue

`mentor-document-workflow-missing-prompts` — "document workflow broken: plan_documents.md, authoring.md, review_documents.md missing from defaults"

## Scope

### In Scope

- Create `src/defaults/prompts/plan_documents.md` — a planning prompt that produces `PLAN_DOCUMENTS.md` in the artifact dir
- Create `src/defaults/prompts/authoring.md` — an authoring prompt that executes the plan by writing/editing markdown files only
- Create `src/defaults/prompts/review_documents.md` — a review prompt that evaluates documentation quality and emits a pass/revise verdict
- Delete `src/defaults/prompts/verify.md` — dead file, never loaded by any workflow step
- Run `npm run sync-defaults` to propagate all additions and the deletion to `.cycle/prompts/`

### Out of Scope

- Changes to `src/defaults/workflows.yml` — the document workflow step definitions are correct
- Changes to engine code — `run-cycle.ts` prompt loading is not the problem
- Test files for prompt content — prompts are not unit-testable in isolation
- Any other workflow prompts or workflow definitions

## Requirements

- All three new prompts must open with the `FILE ARTIFACT MODE` header used by `spec.md`, `build.md`, `review.md`, and `plan.md`
- Prompts must use `CYCLE_ARTIFACT_DIR` for artifact output paths, `{{issue_title}}` and similar variable interpolation patterns consistent with existing prompts
- `plan_documents.md` must instruct the agent to read the source issue and produce `PLAN_DOCUMENTS.md` describing which docs to write or edit
- `authoring.md` must instruct the agent to execute the plan from `PLAN_DOCUMENTS.md`, restricted to markdown files only — no `src/`, no test files, no config, no build tools
- `review_documents.md` must emit a pass/revise verdict that the engine can parse, following the same verdict pattern used by `review.md`
- All three prompts must include the documentation-only constraint explicitly: `.md`/`.mdx` files under `docs/`, `README.md`, and top-level markdown only
- `verify.md` must be confirmed as unreferenced in any non-bash workflow step before deletion

## Acceptance Criteria

- [ ] `src/defaults/prompts/plan_documents.md` exists and contains a `FILE ARTIFACT MODE` header
- [ ] `src/defaults/prompts/authoring.md` exists and contains a `FILE ARTIFACT MODE` header
- [ ] `src/defaults/prompts/review_documents.md` exists and contains a `FILE ARTIFACT MODE` header
- [ ] `src/defaults/prompts/verify.md` does not exist
- [ ] `.cycle/prompts/plan_documents.md` exists (sync-defaults ran successfully)
- [ ] `.cycle/prompts/authoring.md` exists (sync-defaults ran successfully)
- [ ] `.cycle/prompts/review_documents.md` exists (sync-defaults ran successfully)
- [ ] `.cycle/prompts/verify.md` does not exist (sync-defaults propagated the deletion)
- [ ] `npm test` passes with no new failures
- [ ] No entry in `src/defaults/workflows.yml` references `prompts/verify.md` as a non-bash step prompt

## Testing Strategy

- Run `npm test` after all file changes — no new test files required for prompt content
- Grep `src/defaults/workflows.yml` for `verify.md` to confirm it appears only as `command: scripts/verify.sh` (bash step), never as a `prompt:` value
- If any test fixture references `src/defaults/prompts/verify.md` by path, update it to reflect the deletion
- Manually inspect all three new prompts to confirm FILE ARTIFACT MODE header is present and documentation-only constraint is explicit

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No changes required — the document workflow is already listed in the Commands table and the workflows section of BRIEF.md
- **README.md**: No changes required — the document workflow is already listed as shipped

## Dependencies

- Existing prompts `src/defaults/prompts/plan.md`, `src/defaults/prompts/build.md`, `src/defaults/prompts/review.md` must be read in full before writing new prompts, to match FILE ARTIFACT MODE header format, variable interpolation patterns, and verdict instruction blocks
- `npm run sync-defaults` must complete without error — requires `src/defaults/` and `.cycle/` to both be present (standard repo state)
