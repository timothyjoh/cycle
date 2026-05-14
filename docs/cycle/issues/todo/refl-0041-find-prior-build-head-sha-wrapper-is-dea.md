---
id: refl-0041-find-prior-build-head-sha-wrapper-is-dea
title: Remove dead `findPriorBuildHeadSha` wrapper (or mark @deprecated) in run-cycle.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-14T04:06:55.168Z"
source: triage
---
## Context

Cycle 0041 generalized `findPriorBuildHeadSha` into `findPriorStepHeadSha(repoRoot, cycleId, stepName)` to cover both `build` and `fix` step restart-policy resets. The legacy `findPriorBuildHeadSha` symbol was kept as a one-line wrapper in `src/engine/run-cycle.ts` (around line 49) so the existing unit tests in `tests/engine/run-cycle.test.ts` would continue to pass without renaming.

A grep of `src/` confirms the wrapper has zero production callers. The only importers are:

- `tests/engine/run-cycle.test.ts` (four wrapper-specific unit tests)
- the wrapper's own `export` line in `run-cycle.ts`

This is API rot: a future reader will assume the wrapper lives on a real call path and preserve it through refactors as if it were load-bearing.

## Task

Pick **one** of the two options below and execute it cleanly:

### Option A (preferred) — delete the wrapper

1. Delete the `findPriorBuildHeadSha` wrapper and its export from `src/engine/run-cycle.ts`.
2. Rewrite the four wrapper-specific tests in `tests/engine/run-cycle.test.ts` to call `findPriorStepHeadSha(root, cycleId, 'build')` directly. Test intent is identical — only the symbol name and one extra positional argument change.
3. Confirm no other module imports `findPriorBuildHeadSha` (grep `src/` and `tests/`).

### Option B — keep the wrapper as a documented alias

Only choose this if there is a concrete external consumer (none is known today). If so:

1. Add a `@deprecated` JSDoc tag on the wrapper pointing at `findPriorStepHeadSha`.
2. Add a one-line comment naming the planned removal cycle/version.
3. Leave the four tests untouched (they continue to exercise the wrapper).

## Acceptance

- `src/engine/run-cycle.ts` no longer carries a dead symbol with zero production callers OR carries a clearly-marked `@deprecated` alias with a planned-removal note.
- `tests/engine/run-cycle.test.ts` still passes; if Option A, the four tests now target `findPriorStepHeadSha` directly.
- `npm test`, `npm run typecheck`, and `npm run test:coverage` all green; coverage does not regress vs the baseline in CLAUDE.md.

## Notes

- Low priority — cleanup, not correctness. Worth folding into whichever next cycle touches `run-cycle.ts` so it does not become permanent furniture.
- The generalized `findPriorStepHeadSha(repoRoot, cycleId, stepName)` is the canonical API; the `RESET_ELIGIBLE_STEPS` set in `run-cycle.ts` is what gates which steps actually call it.
