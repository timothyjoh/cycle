# Implementation Plan: Cycle 0109

## Overview

Verify whether the `reflection` step precedes `commit` in both `src/defaults/workflows.yml` and `.cycle/workflows.yml` (feature workflow), then execute the failure path: create a new todo issue documenting the missing step and move the source issue to `failed/`.

## Current State (from Research)

- `reflection` is **absent** from `src/defaults/workflows.yml` feature steps (10 steps: `spec, research, plan, build, review, fix, verify, commit, pr, documentation`). Removed by commit `41d5f26`.
- `reflection` is **absent** from `.cycle/workflows.yml` feature steps (8 steps: `spec, research, plan, build, review, fix, verify, commit`). Also removed by `41d5f26`.
- Source issue `refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` is in `todo/`. Its `_raw.md` is already in `done/`.
- Pre-existing triage test failure (`children[0].raw_id: not in current batch`) causes `npm test` to exit non-zero. This failure predates cycle 0109 and fixing it is explicitly out of scope.
- Pattern for new todo issues: YAML frontmatter (`id`, `title`, `workflow`, `depends_on`, `triaged_at`, `source`, `parent`) + body with context and acceptance criteria. See `refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md`.

## Desired End State

After this cycle:
- `docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/DOCUMENTATION.md` exists, recording the verification result (failure) with evidence.
- `docs/cycle/issues/todo/refl-0109-reflection-step-absent-from-feature-workflow-in-both-workflow-files.md` exists, describing the missing reflection step re-addition work.
- `docs/cycle/issues/failed/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` exists (moved from `todo/`).
- `docs/cycle/issues/todo/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` is deleted.
- No src/ file changes (this is a documentation/issue-lifecycle cycle).
- No new test failures beyond the pre-existing triage failure.

## What We're NOT Doing

- Re-adding or re-ordering the `reflection` step in either workflow file — that is the job of the new todo issue.
- Fixing the pre-existing triage test failure — out of scope per SPEC.
- Modifying `src/defaults/workflows.yml` or `.cycle/workflows.yml` — no workflow changes.
- Writing `DOCUMENTATION.md` in the pass-path format — verification fails, so no pass-path artifact.
- Moving any `_raw.md` files — they are already in `done/`.

## Implementation Approach

This is a verification + documentation cycle with zero src/ code changes. All three tasks are file writes/moves in `docs/`. Order matters: verify first, then create the new issue (which references the verification evidence), then move the source issue. `npm test` runs last to confirm no regressions were introduced (the pre-existing triage failure is documented as a known conflict with AC4).

---

## Task 1: Run Verification and Write DOCUMENTATION.md

### Overview

Inspect both workflow files' feature step lists. Confirm `reflection` is absent. Document the finding in `docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/DOCUMENTATION.md`.

### Changes Required

**File**: `docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/DOCUMENTATION.md` *(create)*

**Content**:
```markdown
# Documentation: Cycle 0109 — Traceability Record

## Verification Result: FAILED

### Check 1: `src/defaults/workflows.yml` feature workflow

Inspection of `src/defaults/workflows.yml` lines 14–24 reveals the following feature workflow steps:

  spec, research, plan, build, review, fix, verify, commit, pr, documentation

`reflection` is **absent**. The step was removed by commit `41d5f26` ("updates", 2026-05-16).

### Check 2: `.cycle/workflows.yml` feature workflow

Inspection of `.cycle/workflows.yml` lines 22–29 reveals the following feature workflow steps:

  spec, research, plan, build, review, fix, verify, commit

`reflection` is **absent**. Same removal commit (`41d5f26`).

### Failure Path Actions Taken

1. Created `docs/cycle/issues/todo/refl-0109-reflection-step-absent-from-feature-workflow-in-both-workflow-files.md` to track re-adding `reflection` before `commit`.
2. Moved source issue `refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` from `todo/` to `failed/`.

### Historical Note

Cycle 0078 was supposed to fix reflection-before-commit ordering. Its reflection step ran *after* commit (the very bug being fixed), causing cycle 0078's reflection artifacts to be committed under a later cycle — a self-referential misattribution. The fix dependency (`refl-0078-cycle-0078-fix-never-applied-reflection`) closed in `done/`, but the actual workflow reorder was never applied. Commit `41d5f26` then removed the step entirely. The misattribution issue therefore cannot be declared resolved.
```

### Success Criteria
- [ ] `docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/DOCUMENTATION.md` exists with verification failure evidence
- [ ] Documents both workflow files' step lists explicitly
- [ ] Notes the commit (`41d5f26`) responsible for removal

---

## Task 2: Create New Todo Issue

### Overview

Create a new issue in `docs/cycle/issues/todo/` documenting that `reflection` must be re-added before `commit` in both workflow files.

### Changes Required

**File**: `docs/cycle/issues/todo/refl-0109-reflection-step-absent-from-feature-workflow-in-both-workflow-files.md` *(create)*

**Content**:
```markdown
---
id: refl-0109-reflection-step-absent-from-feature-workflow-in-both-workflow-files
title: Re-add reflection step before commit in both feature workflow files
workflow: feature
depends_on: []
triaged_at: 2026-05-16T00:00:00.000Z
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
```

### Success Criteria
- [ ] File exists at `docs/cycle/issues/todo/refl-0109-reflection-step-absent-from-feature-workflow-in-both-workflow-files.md`
- [ ] Frontmatter valid YAML with all required fields
- [ ] References commit `41d5f26` as evidence
- [ ] Acceptance criteria are concrete and testable

---

## Task 3: Move Source Issue to failed/

### Overview

Move `refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` from `todo/` to `failed/`. The `_raw.md` is already in `done/` — do not move it.

### Changes Required

**Delete**: `docs/cycle/issues/todo/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md`

**Create**: `docs/cycle/issues/failed/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` (identical content to the todo file)

### Success Criteria
- [ ] `docs/cycle/issues/todo/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` does not exist
- [ ] `docs/cycle/issues/failed/refl-0078-reflection-artifacts-for-cycle-0078-will-traceability-record.md` exists with original content intact
- [ ] `docs/cycle/issues/done/refl-0078-reflection-artifacts-for-cycle-0078-will_raw.md` remains in `done/` (no change)

---

## Task 4: Run npm test and Document Result

### Overview

Run `npm test` to confirm no new regressions were introduced by cycle 0109's changes. Document the pre-existing triage failure conflict with AC4.

### Changes Required

No file changes. Run `npm test` and verify:
- Pre-existing triage failure (`children[0].raw_id: not in current batch`) is still the only failure
- No new failures appear

**Note on AC4 conflict**: The SPEC requires `npm test` to exit 0. The pre-existing triage test failure (`tests/cli/triage.test.ts:90`) causes exit 1. Fixing this failure is out of scope per SPEC ("Fixing the triage test suite failures observed in cycle 0108"). The plan resolves this conflict by: verifying no new failures were introduced, and relying on the verify step to accept that the single pre-existing failure predates this cycle.

### Success Criteria
- [ ] `npm test` produces no new failures beyond the pre-existing triage batch test
- [ ] All non-triage tests pass (confirms zero regressions from cycle 0109 changes)
- [ ] Pre-existing failure documented in DOCUMENTATION.md or verify step output

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] Verification result is documented — either checks passed or checks failed with evidence` | Task 1 | DOCUMENTATION.md records failure with step lists and responsible commit |
| `[ ] If checks pass: DOCUMENTATION.md contains a note about cycle 0078 self-referential misattribution resolution` | WAIVED — checks fail; pass-path artifact is not applicable | |
| `[ ] If checks fail: a new docs/cycle/issues/todo/ issue exists describing what is missing; source issue moved to failed/` | Task 2 + Task 3 | Both sub-conditions covered |
| `[ ] All existing tests still pass (npm test exits 0)` | Task 4 | **Partial conflict**: pre-existing triage test failure predates cycle 0109; no new failures introduced. AC technically fails due to out-of-scope pre-existing failure. |
| `[ ] No compiler/linter warnings introduced` | Task 4 | No src/ changes; no compiler warnings possible. Confirmed by zero code edits. |

---

## Testing Strategy

### Unit Tests
- No new tests required (SPEC explicit).
- Existing tests serve as regression guard.

### Integration / E2E Tests
- `npm test` run after all file changes to confirm no regressions.
- Manual inspection of workflow YAML step lists is the primary verification mechanism (already resolved in planning).

## Risk Assessment

- **Pre-existing triage test failure blocks AC4**: Mitigation — document the conflict explicitly; verify step should accept no new failures as passing the spirit of AC4.
- **_raw.md file confusion**: Mitigation — plan explicitly identifies which files move and which do not. Only the triaged file moves.
- **Frontmatter date format**: Mitigation — use ISO 8601 (`2026-05-16T00:00:00.000Z`) matching existing issue format.
