---
id: refl-0252-artifact-steps-missing-plan-documents-au
source: reflection
title: ARTIFACT_STEPS missing plan_documents, authoring, review_documents
added_at: "2026-05-26T01:31:55.578Z"
triage_attempts: 0
priority: medium
origin_cycle_id: "0252"
---

The engine appends `ARTIFACT_SUPPRESS_PROMPT` (via `--append-system-prompt`) only to steps listed in `ARTIFACT_STEPS` (`src/engine/run-cycle.ts:35`). The three new document workflow steps are not in that set, so they run without the engine-level system prompt reinforcement. The inline `FILE ARTIFACT MODE` directive in each prompt partially compensates, but the defense-in-depth guarantee that other artifact steps get is absent.

Add `"plan_documents"`, `"authoring"`, and `"review_documents"` to the `ARTIFACT_STEPS` set in `run-cycle.ts:35`.
