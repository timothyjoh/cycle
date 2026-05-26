---
id: refl-0252-artifact-steps-missing-plan-documents-au
title: Add plan_documents, authoring, review_documents to ARTIFACT_STEPS in run-cycle.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-26T01:43:07.404Z"
source: triage
priority: medium
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
