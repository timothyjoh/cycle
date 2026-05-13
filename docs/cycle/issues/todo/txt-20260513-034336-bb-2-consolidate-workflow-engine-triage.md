---
id: txt-20260513-034336-bb-2-consolidate-workflow-engine-triage
source: text
title: "BB-2: Consolidate workflow + engine + triage config into one src/defaults/workflows.yml file. Top sections: engine: (max_consecutive_failures, base_branch), triage: (agent, prompt, max_turns). Then a workflows: array containing the feature workflow (inline what's currently in src/defaults/workflows/feature.yaml). Update src/engine/workflow.ts to load this new shape (workflows array; pick workflow by name). Delete src/defaults/workflows/ subdirectory after migration. Update sync-defaults.mjs if needed. See docs/RFC-001-issue-lifecycle.md sections 4, 12 (BB-2)."
added_at: 2026-05-13T03:43:36.908Z
triage_attempts: 0
---

BB-2: Consolidate workflow + engine + triage config into one src/defaults/workflows.yml file. Top sections: engine: (max_consecutive_failures, base_branch), triage: (agent, prompt, max_turns). Then a workflows: array containing the feature workflow (inline what's currently in src/defaults/workflows/feature.yaml). Update src/engine/workflow.ts to load this new shape (workflows array; pick workflow by name). Delete src/defaults/workflows/ subdirectory after migration. Update sync-defaults.mjs if needed. See docs/RFC-001-issue-lifecycle.md sections 4, 12 (BB-2).
