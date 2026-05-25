---
id: mentor-document-workflow-missing-prompts
title: "document workflow broken: plan_documents.md, authoring.md, review_documents.md missing from defaults"
workflow: feature
depends_on: []
triaged_at: "2026-05-25T22:02:47.080Z"
source: triage
priority: medium
---
## Problem

`src/defaults/workflows.yml` defines a `document` workflow with three steps that reference prompt files which do not exist in `src/defaults/prompts/`:

- `prompts/plan_documents.md` (step: `plan_documents`)
- `prompts/authoring.md` (step: `authoring`)
- `prompts/review_documents.md` (step: `review_documents`)

`run-cycle.ts` reads the prompt file from disk at step start. Any missing file causes an immediate failure. The `document` workflow is advertised in the README table as a shipped workflow and is currently broken for all users.

`src/defaults/prompts/verify.md` also exists but is unreachable — `verify` is always a `bash` step in every shipped workflow, so this file is never loaded by the engine.

## Acceptance Criteria

- [ ] `src/defaults/prompts/plan_documents.md` exists with a functional prompt that writes `PLAN_DOCUMENTS.md` to the artifact dir
- [ ] `src/defaults/prompts/authoring.md` exists with a functional prompt that writes documentation changes to the repo (markdown files only — no source code)
- [ ] `src/defaults/prompts/review_documents.md` exists with a functional prompt that reviews documentation quality and emits a pass/revise verdict
- [ ] All three prompts follow the FILE ARTIFACT MODE pattern used by `spec.md`, `build.md`, `review.md`
- [ ] `src/defaults/prompts/verify.md` is deleted (it is never loaded by any shipped workflow step)
- [ ] `npm run sync-defaults` is run so `.cycle/prompts/` reflects all additions and the deletion
- [ ] `npm test` passes with no new failures

## Implementation Notes

### Read existing prompts first

Before writing anything, read `src/defaults/prompts/plan.md`, `src/defaults/prompts/build.md`, and `src/defaults/prompts/review.md` in full. These establish the FILE ARTIFACT MODE header, `CYCLE_ARTIFACT_DIR` usage, variable interpolation patterns (`{{issue_title}}`, `{{spec_content}}`, `{{plan_content}}`, etc.), and the pass/fail/revise instruction blocks that the engine parses.

Also read `src/defaults/workflows.yml` to see the exact step names, agent assignments, and any `input_from` chaining used by the `document` workflow.

### Prompt mapping

| New file | Model after | Role |
|---|---|---|
| `plan_documents.md` | `plan.md` | Research the issue; produce `PLAN_DOCUMENTS.md` in artifact dir describing what docs to write/edit |
| `authoring.md` | `build.md` | Execute the plan; write or edit markdown files only — no `src/`, no tests, no config |
| `review_documents.md` | `review.md` | Review documentation quality; emit pass/revise verdict with specific feedback |

### Documentation-only constraint

All three prompts must explicitly restrict the agent to:
- Markdown files only (`.md`, `.mdx`, `README`, `CHANGELOG`, etc.)
- Documentation paths (`docs/`, `README.md`, top-level `.md` files)
- No modifications to `src/`, test files, or config files

For `authoring.md`, do not instruct the agent to run any build tools (no `npm run build`, no linters). Docs-only edits.

### verify.md removal

Delete `src/defaults/prompts/verify.md`. Confirm before deleting that no entry in `src/defaults/workflows.yml` references it as a non-bash step prompt. It is dead code.

### sync-defaults

After all file additions and deletions in `src/defaults/prompts/`:

```
npm run sync-defaults
```

This copies `src/defaults/` → `.cycle/` so the running engine sees the changes.

### Tests

No new test files are required for the prompt content itself. Run `npm test` to confirm no regressions. If any test fixture or snapshot references `verify.md` by path, update it to reflect the deletion.
