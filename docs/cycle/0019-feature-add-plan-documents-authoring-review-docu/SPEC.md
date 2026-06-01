# SPEC — Cycle 0019: Bring Document-Workflow Steps Under the Completion-Proof Contract

## Objective
The three document-workflow steps — `plan_documents`, `authoring`, and `review_documents` — currently produce output artifacts but receive neither the engine-level File-Artifact-Mode prompt reinforcement nor the completion-proof post-condition that every other artifact-producing step gets. This cycle adds all three to the `STEP_ARTIFACTS` table in `src/engine/run-cycle.ts`, which simultaneously enrolls them in `ARTIFACT_STEPS` (prompt suppression via `--append-system-prompt`) and in the completion-proof contract (an empty artifact after exit 0 becomes a retryable step failure rather than a silent pass). This closes the defense-in-depth gap so document steps behave identically to feature-workflow steps.

## Source Issue
`refl-0252-artifact-steps-missing-plan-documents-au` — "Add plan_documents, authoring, review_documents to ARTIFACT_STEPS in run-cycle.ts"

## Scope

### In Scope
- Add three entries to the `STEP_ARTIFACTS` Map in `src/engine/run-cycle.ts`: `plan_documents → { artifact: "PLAN_DOCUMENTS.md", proof: "nonempty" }`, `authoring → { artifact: "AUTHORING.md", proof: "nonempty" }`, `review_documents → { artifact: "REVIEW_DOCUMENTS.md", proof: "nonempty" }`.
- Extend the test suite to assert both `ARTIFACT_STEPS` membership and `nonempty` completion-proof behavior (pass on a non-empty artifact, retryable failure on an empty artifact) for the three new steps.

### Out of Scope
- Editing any obsolete hand-written `ARTIFACT_STEPS` array literal — that list no longer exists; `ARTIFACT_STEPS` is derived from `STEP_ARTIFACTS.keys()`. The prescribed edit in the issue's "Fix" section is stale and must not be followed.
- Adding new proof policies (`spec-min-bytes`, `fix-conditional`) to the document steps — all three use the existing `"nonempty"` policy.
- Changes to the document-workflow prompt files (`prompts/plan_documents.md`, `prompts/authoring.md`, `prompts/review_documents.md`).
- Changes to any other workflow's step set or to `SKIP_ELIGIBLE_STEPS` / `RESET_ELIGIBLE_STEPS`.

## Requirements
- `STEP_ARTIFACTS` must contain entries for `plan_documents`, `authoring`, and `review_documents`, each mapping to the canonical uppercase basename (`<NAME>.md`) and the `"nonempty"` proof policy. The basenames must equal `name.toUpperCase() + ".md"` to match the engine's artifact-path derivation at `run-cycle.ts:483`.
- The derived `ARTIFACT_STEPS` set (`new Set(STEP_ARTIFACTS.keys())`) must consequently include all three names, so each non-`bash` step receives the `ARTIFACT_SUPPRESS_PROMPT` via `appendSystemPrompt`.
- Each of the three steps must run through the completion-proof check after exit 0: a non-empty written artifact emits `step.completion_check { status: "pass" }`; an empty (missing/0-byte/whitespace-only per `classifyArtifact`) artifact emits `step.completion_check { status: "fail" }`, sets `r.status = "failed"`, and routes through the unchanged failure / `max_cycle_attempts` path.
- No second hand-maintained list of artifact step names may be introduced; `ARTIFACT_STEPS` must remain derived from `STEP_ARTIFACTS`.
- **Failure behavior**: When any of these three steps exits 0 but its declared artifact is empty, the engine must surface a visible `step.completion_check { status: "fail" }` event and convert the result to a failed step (via `formatCompletionProofError`) — never accept the empty output silently. The proof check reuses the fail-closed `classifyArtifact` helper, so an unreadable artifact is classified `empty` and likewise produces a failure rather than a swallowed pass. Steps not present in `STEP_ARTIFACTS` and all `bash` steps remain unaffected.

## Acceptance Criteria
- [ ] `STEP_ARTIFACTS.has("plan_documents")`, `STEP_ARTIFACTS.has("authoring")`, and `STEP_ARTIFACTS.has("review_documents")` are all `true`, with `artifact` values `"PLAN_DOCUMENTS.md"`, `"AUTHORING.md"`, `"REVIEW_DOCUMENTS.md"` and `proof` `"nonempty"` respectively.
- [ ] `ARTIFACT_STEPS.has("plan_documents")`, `ARTIFACT_STEPS.has("authoring")`, and `ARTIFACT_STEPS.has("review_documents")` are all `true`.
- [ ] A test drives a `plan_documents` (or `authoring` / `review_documents`) step that exits 0 with a non-empty artifact and asserts a single `step.completion_check { status: "pass" }` event and a successful step outcome.
- [ ] **Failure path**: A test drives one of the three new steps to exit 0 while its declared artifact is empty/whitespace-only, and asserts a `step.completion_check { status: "fail" }` event plus a terminal step failure (`cycle.end { status: "failed", failing_step: <step> }`), leaving the empty artifact treated as a retryable failure rather than a pass.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).
- [ ] Coverage does not decrease against the master baseline; `src/engine/run-cycle.ts` stays at or above its 90% per-file floor.

## Testing Strategy
- Use the existing `node:test` + `node:assert` framework and the conventions in `tests/engine/run-cycle.test.ts`.
- Membership assertions: import `STEP_ARTIFACTS` (and the existing `ARTIFACT_STEPS` test surface, exporting it if the membership tests require it) and assert the three new keys and their `{ artifact, proof }` shapes.
- Happy path: a configured workflow step named `plan_documents` (or sibling) that produces a non-empty artifact yields exactly one `step.completion_check` with `status: "pass"` — assert with `filter(predicate).length === 1` / the `expectExactlyOne` helper per the exactly-once test convention.
- Failure path: the same step producing an empty/whitespace-only artifact yields `step.completion_check { status: "fail" }` and drives `cycle.end { status: "failed" }`; assert state (the failing-step routing) is unchanged from the generic `"nonempty"` failure path.
- Regression: confirm steps absent from `STEP_ARTIFACTS` and `bash` steps emit no `step.completion_check` and receive no `ARTIFACT_SUPPRESS_PROMPT`.
- No UI surface; no E2E/Playwright tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `STEP_ARTIFACTS` / completion-proof description under the `src/engine/run-cycle.ts` architecture notes to reflect that `plan_documents`, `authoring`, and `review_documents` are now declared artifact steps under the `"nonempty"` proof policy.
- **docs/ENGINE.md**: Update the *Completion-proof post-condition* section's step list to include the three document-workflow steps.
- **README.md**: No user-facing change to surface — this is an internal engine-contract change.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `STEP_ARTIFACTS`, `ARTIFACT_STEPS`, `classifyArtifact`, `formatCompletionProofError`, and the `step.completion_check` emission already exist in `src/engine/run-cycle.ts`.
- The `plan_documents`, `authoring`, and `review_documents` steps already exist in the document workflow defined in `.cycle/workflows.yml` (and `src/defaults/workflows.yml`).
- No new external services or environment variables. If `src/defaults/` is touched, run `npm run sync-defaults`; this cycle edits only `src/engine/run-cycle.ts` and tests, so no defaults sync is expected.
