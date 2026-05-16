---
id: refl-0081-reflection-before-commit-reorder-still-u
title: Apply reflection-before-commit step reorder in workflows.yml, test, and CLAUDE.md (cycle 0082 target)
workflow: feature
depends_on: [refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks]
triaged_at: "2026-05-16T00:44:44.627Z"
source: triage
---
## Problem

Three cycles (0078, 0081) each produced a commit titled as if the reflection-before-commit reorder shipped, but the actual step order remains wrong:

- `src/defaults/workflows.yml:24` still has `reflection` after `pr`
- `.cycle/workflows.yml:30` still has `reflection` after `commit`

The original tracking issue `refl-0078-cycle-0078-fix-never-applied-reflection` drained to `done/` when cycle 0081 closed, creating a false traceability record. Both failures were caused by the missing empty-diff post-condition guard: placeholder BUILD.md/FIX.md artifacts allowed cycles to drain to `done/` with zero code changes.

## Implementation

All four required edits are fully specified in `docs/cycle/0081-feature-apply-the-reflection-before-commit-reord/PLAN.md` Tasks 1–4. No research needed — apply them directly:

**Task 1 — `src/defaults/workflows.yml`**: Move the `reflection` step to before `commit` (target: line 22). After the reorder the step sequence must be `[..., "verify", "reflection", "commit", "pr"]`.

**Task 2 — `.cycle/workflows.yml`**: Move `reflection` to before `commit` (target: line 29). Preserve the LOCAL DIVERGENCE block at lines 11–16 verbatim. After the reorder the sequence must be `[..., "verify", "reflection", "commit"]` (no `pr` — trunk-based).

**Task 3 — `tests/defaults/feature-yaml.test.ts:11`**: Update the step-order array assertion to `[..., "verify", "reflection", "commit", "pr", ...]` to match the new default workflow shape.

**Task 4 — `CLAUDE.md`** (around line 73, inside the workflow defaults section): Append the ordering invariant sentence documenting that `reflection` must precede `commit`/`pr` so reflection artifacts ride the same commit as the feature change.

## Precondition

The empty-diff guard (`refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks`) must land first. Without it, a permission-blocked or placeholder-only BUILD.md/FIX.md will once again let the cycle drain to `done/` with zero code changes, repeating the 0078/0081 failure pattern.

## Acceptance Criteria

- `src/defaults/workflows.yml` step order contains `[..., "verify", "reflection", "commit", "pr"]`
- `.cycle/workflows.yml` step order contains `[..., "verify", "reflection", "commit"]`
- LOCAL DIVERGENCE block at `.cycle/workflows.yml` lines 11–16 preserved verbatim
- `tests/defaults/feature-yaml.test.ts` step-order assertion updated and passing
- `CLAUDE.md` documents the reflection-before-commit ordering invariant
- `npm test` passes with no regressions
- `npm run sync-defaults` exits 2 (divergent) for `.cycle/workflows.yml` — the local trunk-based divergence is expected and must not be clobbered
