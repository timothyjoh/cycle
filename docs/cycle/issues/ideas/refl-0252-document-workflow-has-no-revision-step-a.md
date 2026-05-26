---
id: refl-0252-document-workflow-has-no-revision-step-a
source: reflection
title: document workflow has no revision step after review_documents verdict
added_at: "2026-05-26T01:31:55.578Z"
triage_attempts: 0
priority: discuss
origin_cycle_id: "0252"
---

The `review_documents.md` prompt instructs the agent to write `MUST-FIX.md` when issues are found, and the SPEC requires a verdict the engine can parse. But `src/defaults/workflows.yml` defines the document workflow as four steps ending at `verify` — there is no `fix`-type step with `skip_unless: MUST-FIX.md` after `review_documents`. Any MUST-FIX items the reviewer writes go unread and the workflow completes regardless of verdict.

This is a design question: should the document workflow add a revision step (analogous to `fix` / `final_fix` in the feature workflow), or should the review step only emit advisory notes with no engine gate? Needs human input before filing implementation work.
