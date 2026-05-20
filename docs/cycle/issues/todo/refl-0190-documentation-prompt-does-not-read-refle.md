---
id: refl-0190-documentation-prompt-does-not-read-refle
title: Add REFLECTION.md to documentation prompt inputs so cycle 0190 reorder delivers its intended benefit
workflow: feature
depends_on: []
triaged_at: "2026-05-20T01:57:35.168Z"
source: triage
---
## Context

Cycle 0190 reordered the feature workflow so `reflection` runs at step 7 and `documentation` at step 8. The stated motivation: reflection insights (sharp edges, known limitations, deferred items) would be available to the documentation agent when writing release notes and doc updates.

The reorder landed correctly in `.cycle/workflows.yml` and `src/defaults/workflows.yml`. However, the documentation agent prompt (`src/defaults/prompts/documentation.md` and `.cycle/prompts/documentation.md`) lists only these inputs:

- `SPEC.md`
- `BUILD.md`
- `REVIEW.md`
- `FIX.md`

`REFLECTION.md` is absent. Without reading it, the documentation step produces the same output it would have before the reorder. The precondition (reflection artifact exists when documentation runs) now holds structurally, but the documentation agent has no awareness of it — the reorder is inert.

## Task

Add `REFLECTION.md` to the `## Inputs to read` section of `src/defaults/prompts/documentation.md`, with guidance on what to extract:

- **Deferred items**: work the implementation explicitly deferred that consumers should know about
- **Known limitations**: caveats or constraints that affect documented behavior or usage
- **Sharp edges**: non-obvious behaviors worth surfacing in release notes or usage docs

After editing `src/defaults/prompts/documentation.md`, run `npm run sync-defaults` to propagate the change to `.cycle/prompts/documentation.md`.

## Acceptance Criteria

- [ ] `REFLECTION.md` appears in the `## Inputs to read` section of `src/defaults/prompts/documentation.md`
- [ ] Guidance on what to extract from `REFLECTION.md` is included in the prompt body
- [ ] `npm run sync-defaults` run after editing the source; `.cycle/prompts/documentation.md` matches
- [ ] `npm test` passes with no regressions
- [ ] No coverage regression vs master baseline
