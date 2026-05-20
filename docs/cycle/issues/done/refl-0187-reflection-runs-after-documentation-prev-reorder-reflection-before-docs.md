---
id: refl-0187-reflection-runs-after-documentation-prev-reorder-reflection-before-docs
title: "Reorder feature workflow: reflection before documentation"
workflow: feature
depends_on: []
triaged_at: "2026-05-19T17:43:33.535Z"
source: triage
parent: refl-0187-reflection-runs-after-documentation-prev
---
## Problem

The feature workflow currently orders steps as: …verify → documentation → reflection. Reflection runs after documentation has already written to README.md and ARCHITECTURE.md. Any insights the reflection agent surfaces—known limitations, deferred items, sharp edges—cannot influence the current cycle's documentation output. Reflection's value as a lessons-capture step is partially wasted when docs are already committed before it runs.

## Root Cause

Cycle 0187 added the reflection step at position 9, placing it after documentation at position 8. The step was appended at the end of the workflow as the path of least resistance, but the correct position is before documentation so reflection insights can inform release notes and doc updates before commit.

The reflection agent operates on: the git diff, SPEC.md, PLAN.md, BUILD.md, and REVIEW.md. All of these are available before the documentation step runs, so no dependency prevents an earlier placement.

Related issue in todo: `refl-0055-documentation-step-edits-leak-into-next-reorder-documentation-before-commit.md` addresses the complementary problem of documentation edits bleeding into next-cycle commit scope—both issues converge on the same area of the workflow.

## Proposed Fix

Swap the order of `reflection` and `documentation` in the feature workflow step list inside `src/defaults/workflows.yml` so the sequence becomes:

```
…verify → reflection → documentation → commit
```

After editing `src/defaults/`, run `npm run sync-defaults` to propagate the change to `.cycle/workflows.yml`.

No prompt changes are required. The reflection prompt already produces raw issue drops to `docs/cycle/issues/raw/`; the documentation agent can then reference the diff and BUILD.md (which may reference freshly-dropped raw issues) when writing release notes.

## Acceptance Criteria

- [ ] `reflection` step appears **before** `documentation` in `src/defaults/workflows.yml` feature workflow
- [ ] `npm run sync-defaults` run; `.cycle/workflows.yml` reflects the new order
- [ ] `tests/defaults/feature-yaml.test.ts` step-order assertions updated to match new positions
- [ ] `tests/defaults/feature-loadable.test.ts` updated if it pins step count or order
- [ ] `tests/dogfood/feature-yaml.test.ts` updated if it asserts step ordering
- [ ] `npm test` passes with no regressions
- [ ] ARCHITECTURE.md or README.md updated if they enumerate feature workflow steps by position
