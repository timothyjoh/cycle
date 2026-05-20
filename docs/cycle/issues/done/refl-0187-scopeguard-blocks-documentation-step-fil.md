---
id: refl-0187-scopeguard-blocks-documentation-step-fil
title: Auto-append documentation-step output paths to BUILD.md Touched Files so scopeGuard passes
workflow: feature
depends_on: []
triaged_at: "2026-05-19T17:22:13.716Z"
source: triage
failed_at: "2026-05-19T18:57:52.741Z"
failed_step: commit
failed_attempts: 3
last_cycle_id: "0188"
---
## Problem

`scopeGuard` in `src/engine/commit-cycle.ts:47–79` rejects any staged or modified file not listed under `## Touched Files` in `BUILD.md`. The documentation step (workflow step 8) runs before commit and modifies `README.md` and `docs/ARCHITECTURE.md`. BUILD.md is authored during the build step (step 4) and only lists source/test files — documentation-step outputs are therefore never in the touched set.

This is the confirmed root cause of cycle 0187's commit failure (obs 2289). The second attempt (now at reflection) has the same unresolved state: `README.md` and `docs/ARCHITECTURE.md` modified and absent from BUILD.md Touched Files.

## Fix Direction

Implement option (a): after the documentation step executes, `run-cycle.ts` auto-appends any paths that step modified (and that are not already present) into the `## Touched Files` section of BUILD.md.

This is the most robust fix because the engine owns both step execution and BUILD.md. Options (b) and (c) either hard-code path patterns or require prompt-level coordination, both of which are fragile.

## Acceptance Criteria

- After the documentation step completes, any files it modified that are absent from `## Touched Files` are appended to that section in BUILD.md.
- A subsequent `scopeGuard` check passes with those paths now declared.
- Cycles that have no documentation step are unaffected.
- Unit test covers the auto-append path (step present, one new file appended; step present, file already listed, no duplicate; no documentation step, BUILD.md unchanged).
- All existing tests continue to pass.

## Files Likely Touched

- `src/engine/run-cycle.ts` — inject post-documentation-step BUILD.md append logic
- `tests/engine/run-cycle.test.ts` (or equivalent) — new unit tests for the append behavior

## Related

- `refl-0055-documentation-step-edits-leak-into-next-reorder-documentation-before-commit.md` — related issue proposing reordering documentation before commit as an alternative mitigation; the two fixes are complementary but independent
- Obs 2289, 2290, 2291, 2292 for investigation trail
