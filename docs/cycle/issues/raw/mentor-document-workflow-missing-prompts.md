---
id: mentor-document-workflow-missing-prompts
title: "document workflow broken: plan_documents.md, authoring.md, review_documents.md missing from defaults"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 9
---

## Problem

`src/defaults/workflows.yml` defines a `document` workflow with three steps that reference prompt files which do not exist in `src/defaults/prompts/`:

- `prompts/plan_documents.md` (step: `plan_documents`)
- `prompts/authoring.md` (step: `authoring`)
- `prompts/review_documents.md` (step: `review_documents`)

Running `cycle run --workflow document` fails at step 1 because `run-cycle.ts` reads the prompt file from disk and the path resolves to nothing. The `document` workflow is advertised in the README table as a shipped workflow. It is currently broken for all users.

Additionally, `src/defaults/prompts/verify.md` exists but is unreachable — `verify` is always a `bash` step in every shipped workflow, so this file is never loaded. It should be removed or repurposed.

## Acceptance Criteria

- [ ] `src/defaults/prompts/plan_documents.md` exists with a functional prompt that writes `PLAN_DOCUMENTS.md` to the artifact dir
- [ ] `src/defaults/prompts/authoring.md` exists with a functional prompt that writes documentation changes to the repo
- [ ] `src/defaults/prompts/review_documents.md` exists with a functional prompt that reviews documentation quality
- [ ] `cycle run --workflow document` completes without a missing-file error on a repo with a queued issue
- [ ] All three prompts follow the FILE ARTIFACT MODE pattern used by `spec.md`, `build.md`, etc.
- [ ] `src/defaults/prompts/verify.md` is removed or its purpose documented (it is never loaded by any shipped workflow step)
- [ ] `npm run sync-defaults` is run so `.cycle/prompts/` reflects the new files
- [ ] All existing tests pass

## Notes

Model the new prompts after `plan.md` (for `plan_documents`), `build.md` (for `authoring`), and `review.md` (for `review_documents`). The document workflow should not write code — constrain the prompts to markdown / documentation edits only.
