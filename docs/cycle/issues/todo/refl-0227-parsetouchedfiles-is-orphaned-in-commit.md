---
id: refl-0227-parsetouchedfiles-is-orphaned-in-commit
title: Delete orphaned parseTouchedFiles from commit-cycle.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-21T14:45:06.793Z"
source: triage
---
## Problem

`src/engine/commit-cycle.ts` exports `parseTouchedFiles(buildMdPath)` (line 15), which reads the `## Touched Files` YAML block from a BUILD.md artifact. After cycle 0227 removed `scopeGuard` and replaced the agent-authored BUILD.md mechanism with engine-owned `touched.json`, `parseTouchedFiles` has no production caller. Only three tests in `tests/engine/commit-cycle.test.ts` (lines 424–463) exercise it directly.

Keeping it exported creates a maintenance trap: future maintainers will see an exported async function with dedicated tests and assume it is load-bearing. It will also silently diverge from the actual footprint mechanism as `touched.json` evolves.

## Required changes

1. Delete `parseTouchedFiles` from `src/engine/commit-cycle.ts`.
2. Delete the three unit tests at `tests/engine/commit-cycle.test.ts:424–463` that exercise it directly.
3. Run `npm test` and confirm all tests pass and coverage floors hold.

## Acceptance criteria

- `parseTouchedFiles` does not appear in `src/engine/commit-cycle.ts` (grep clean).
- No test references `parseTouchedFiles`.
- Full test suite passes with no coverage regressions.

## Out of scope

If BUILD.md parsing is ever needed again for migration diagnostics, it belongs in a separate utility module with a comment explaining its non-production status. Do not add such a module in this cycle — delete only.
