---
id: refl-0252-artifact-steps-missing-plan-documents-au
title: Add plan_documents, authoring, review_documents to ARTIFACT_STEPS in run-cycle.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-26T01:43:07.404Z"
source: triage
priority: low
---
## RESCOPE (audit 2026-06-01) — read first

This issue's prescribed edit is STALE. `ARTIFACT_STEPS` is no longer a
hand-written literal — it is now derived: `ARTIFACT_STEPS = new Set(STEP_ARTIFACTS.keys())`
(`src/engine/run-cycle.ts`). **Do NOT edit an `ARTIFACT_STEPS` array** (the code
block below is obsolete).

Correct change: add three entries to the `STEP_ARTIFACTS` Map —
`plan_documents → { artifact:"PLAN_DOCUMENTS.md", proof:"nonempty" }`,
`authoring → { artifact:"AUTHORING.md", proof:"nonempty" }`,
`review_documents → { artifact:"REVIEW_DOCUMENTS.md", proof:"nonempty" }`.

**Intended behavior change (approved):** adding these to STEP_ARTIFACTS also
brings them under the **completion-proof contract** — an empty artifact from
these document-workflow steps becomes a *retryable step failure*, not just
prompt suppression. This defense-in-depth is the goal (matches feature-workflow
steps). Add/adjust tests for BOTH the suppression-prompt membership AND the
completion-proof behavior on these three steps.

---
## Problem

The engine appends `ARTIFACT_SUPPRESS_PROMPT` via `--append-system-prompt` only to steps listed in `ARTIFACT_STEPS` (`src/engine/run-cycle.ts:35`). The three document workflow steps introduced in cycle 0252 are absent from that set:

```
const ARTIFACT_STEPS = new Set(["spec", "research", "plan", "build", "review", "fix", "final_fix", "documentation"]);
```

Each prompt file contains an inline `FILE ARTIFACT MODE` directive that partially compensates, but the engine-level system prompt reinforcement — the defense-in-depth layer that all other artifact-producing steps receive — is missing.

## Fix

In `src/engine/run-cycle.ts:35`, add the three new step names:

```typescript
const ARTIFACT_STEPS = new Set(["spec", "research", "plan", "build", "review", "fix", "final_fix", "documentation", "plan_documents", "authoring", "review_documents"]);
```

## Tests

The existing test suite in `tests/engine/run-cycle.test.ts` already covers `ARTIFACT_STEPS` membership for other step names. Extend it to assert:

- `ARTIFACT_STEPS.has("plan_documents")` is `true`
- `ARTIFACT_STEPS.has("authoring")` is `true`
- `ARTIFACT_STEPS.has("review_documents")` is `true`

Also verify the export is stable if `ARTIFACT_STEPS` is exported (currently it is not — if adding an export is needed to test, export it).

## Acceptance criteria

- `ARTIFACT_STEPS` contains all three new step names
- Tests assert membership of all three
- `npm test` passes
- Coverage does not decrease
