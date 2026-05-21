---
id: refl-0224-four-other-prompt-templates-still-embed
title: Genericize hardcoded cycle-0218 paths in fix.md, research.md, plan.md, and review.md templates
workflow: feature
depends_on: []
triaged_at: "2026-05-21T23:28:21.683Z"
source: triage
priority: low
---
## Background

Cycle 0224 replaced the hardcoded `docs/cycle/0217-…/` path in `src/defaults/spec.md` with the generic placeholder `NNNN-feature-<title>`. That fix was scoped to `spec.md` only; the SPEC explicitly deferred the four remaining templates.

Four default prompt templates still embed a concrete cycle directory in their negative/correct examples:

- `src/defaults/fix.md`
- `src/defaults/research.md`
- `src/defaults/plan.md`
- `src/defaults/review.md`

All four contain references to `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/`. As cycles accumulate, the model may interpret these as historical artifacts rather than live guardrails, mirroring the staleness problem that motivated cycle 0224.

## Work

1. In each of the four files, replace every occurrence of the hardcoded path `docs/cycle/0218-feature-fix-artifact-contamination-at-invocation/` (and any other concrete cycle directory used as an example) with the generic form `docs/cycle/NNNN-feature-<title>/`, matching the substitution pattern applied to `spec.md` in cycle 0224.
2. Run `npm run sync-defaults` to propagate the changes from `src/defaults/` to `.cycle/`.
3. Run `npm test` to confirm no regressions.
4. Verify the four `.cycle/` output files (fix.md, research.md, plan.md, review.md) no longer contain `0218` or any other concrete cycle-directory reference in example text.

## Acceptance criteria

- `grep -r '0218-feature' src/defaults/` returns no matches.
- `grep -r '0218-feature' .cycle/` returns no matches.
- All four template files use `NNNN-feature-<title>` (or equivalent clearly-generic placeholder) wherever a cycle directory appears in example text.
- `npm test` passes with no coverage regression.
