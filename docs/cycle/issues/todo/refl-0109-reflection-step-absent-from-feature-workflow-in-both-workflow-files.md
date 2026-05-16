---
id: refl-0109-reflection-step-absent-from-feature-workflow-in-both-workflow-files
title: Re-add reflection step before commit in both feature workflow files
workflow: feature
depends_on: []
triaged_at: "2026-05-16T00:00:00.000Z"
source: triage
parent: ""
---
## Context

Cycle 0109 verification confirmed that `reflection` is absent from the `feature` workflow step list in both `src/defaults/workflows.yml` and `.cycle/workflows.yml`. The step was removed by commit `41d5f26` ("updates", 2026-05-16).

The reflection-before-commit ordering was originally tracked in `refl-0078-cycle-0078-fix-never-applied-reflection` (now in `done/`) and required by the cycle engine to produce per-cycle REFLECTION.md artifacts committed in the correct cycle. Without this step, reflection artifacts are either skipped or committed under a later cycle.

The dependent issue `refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record` was moved to `failed/` by cycle 0109 because the prerequisite (reflection step present before commit) was not met.

## Required Implementation

In `src/defaults/workflows.yml`, insert `reflection` before `commit` in the `feature` workflow steps:

```yaml
- { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
- { name: commit,     agent: bash,       command: scripts/commit.sh }
```

In `.cycle/workflows.yml`, insert `reflection` before `commit` in the `feature` workflow steps:

```yaml
- { name: reflection, agent: claudecode, prompt: prompts/reflection.md }
- { name: commit,     agent: bash,       command: scripts/commit-trunk.sh }
```

After editing `src/defaults/`, run `npm run sync-defaults` to propagate to `.cycle/`.

Update `tests/defaults/feature-yaml.test.ts` and `tests/dogfood/feature-yaml.test.ts` step-order assertions to include `reflection` at the correct position.

## Acceptance Criteria

- [ ] `reflection` step appears before `commit` in `src/defaults/workflows.yml` feature workflow
- [ ] `reflection` step appears before `commit` in `.cycle/workflows.yml` feature workflow
- [ ] `tests/defaults/feature-yaml.test.ts` step-order assertion includes `reflection`
- [ ] `tests/dogfood/feature-yaml.test.ts` step-order assertion includes `reflection`
- [ ] `npm test` passes with no regressions
