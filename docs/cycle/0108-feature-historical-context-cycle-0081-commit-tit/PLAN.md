All context resolved. Both guard issues are in `done/` but implementations never landed. Writing plan now.

# Implementation Plan: Cycle 0108

## Overview
Verify whether the empty-diff post-condition guard (`src/engine/run-cycle.ts`) and the artifact-only commit guard (`.cycle/scripts/commit-trunk.sh`) were actually implemented, document findings in BUILD.md, create new `todo/` issues for each missing guard, and move the source issue to `done/`.

## Current State (from Research)
Both guards are confirmed absent:
- **Empty-diff guard** (`run-cycle.ts`): No `git diff` check after build/fix steps. Only existing post-conditions are spec-byte-floor (lines 198–204) and reflection ingest (207–209). Original issue `refl-0078-build-and-fix-steps-silently-succeed-whe.md` was moved to `done/` but the guard was never implemented.
- **Artifact-only guard** (`commit-trunk.sh`): Lines 62–65 exit `0` on empty staged index but do not check for `src/` presence. Original issue `refl-0083-commit-trunk-sh-commits-artifact-only-ch.md` was moved to `done/` but the guard was never implemented.

Source issue to move: `docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` — confirmed present.

## Desired End State
After this cycle:
- `docs/cycle/0108-.../BUILD.md` documents both verification findings (absent)
- Two new `todo/` issues exist — one per missing guard
- Source issue is in `docs/cycle/issues/done/`
- `npm test` passes with no regressions

## What We're NOT Doing
- Implementing either guard (separate cycles)
- Modifying `src/` files
- Modifying test files
- Cleaning up `.cycle/scripts/commit-trunk.sh.bak` (out of scope)
- Modifying `commit-trunk.sh` itself

## Implementation Approach
Pure documentation and file-move cycle. No compilation, no code changes. Four discrete file operations: write BUILD.md, create two new issue files, move one issue file. Verify with `npm test` at the end to confirm no regressions from the file moves.

---

## Task 1: Write BUILD.md with Verification Findings

### Overview
Produce the cycle BUILD artifact documenting that both guards are absent from source, with precise file/line references for each finding.

### Changes Required
**File**: `docs/cycle/0108-feature-historical-context-cycle-0081-commit-tit/BUILD.md`
**Changes**: Create with these sections:

```markdown
# BUILD — Cycle 0108

## Verification Findings

### Empty-diff post-condition guard — `src/engine/run-cycle.ts`
**Status: ABSENT**
Inspected all 264 lines. Existing post-conditions:
- Spec-byte-floor guard (lines 198–204): `if (step.name === "spec" && bytes < SPEC_MIN_BYTES)`
- Reflection ingest (lines 207–209): `if (step.name === "reflection")`
No `git diff` invocation. No check for whether build/fix steps produced src/ changes.
Related failed issues: `refl-0078-build-and-fix-steps-silently-succeed-whe.md` (marked done/ but guard not implemented).

### Artifact-only commit guard — `.cycle/scripts/commit-trunk.sh`
**Status: ABSENT**
Lines 62–65 exit 0 on empty staged index:
```bash
if git diff --cached --quiet; then
  echo "commit-trunk.sh: nothing to commit"
  exit 0
fi
```
No `src/`-filter. No `git diff --cached --name-only | grep "^src/"` check. No non-zero exit for artifact-only commits.
Related failed issues: `refl-0083-commit-trunk-sh-commits-artifact-only-ch.md` (marked done/ but guard not implemented).

## Actions Taken
- Created `docs/cycle/issues/todo/refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md`
- Created `docs/cycle/issues/todo/refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh.md`
- Moved source issue to `docs/cycle/issues/done/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md`
```

### Success Criteria
- [ ] BUILD.md exists at the cycle artifact path
- [ ] BUILD.md names both guards with ABSENT status
- [ ] BUILD.md includes file:line references for each finding

---

## Task 2: Create New Todo Issue — Empty-diff Post-condition Guard

### Overview
Create a fresh `todo/` issue for the missing empty-diff guard in `run-cycle.ts` so the engine can pick it up in a future cycle.

### Changes Required
**File**: `docs/cycle/issues/todo/refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md`

```markdown
---
id: refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts
title: "Implement empty-diff post-condition guard in src/engine/run-cycle.ts"
workflow: feature
depends_on: []
triaged_at: "2026-05-16T00:00:00.000Z"
source: triage
parent: ""
---
## Problem

`src/engine/run-cycle.ts` has no guard that checks whether a build or fix step produced any src/ changes. Cycles can report `status:ok` while the actual diff contains only cycle artifact files (BUILD.md, RESEARCH.md, etc.), resulting in misleading commit titles that claim implementation work was done.

This was originally tracked in `refl-0078-build-and-fix-steps-silently-succeed-whe.md` (now in done/) but the guard was never implemented. Cycle 0108 verification confirmed absence at lines 198–228 of run-cycle.ts.

## Required Implementation

After a build or fix step completes with status:ok, run:
```
git diff HEAD -- src/ | head -1
```
If the output is empty (no src/ changes), the step should be re-classified as a failure and the cycle should halt or retry rather than continue to commit.

The precedent for step-name-based post-conditions is at `src/engine/run-cycle.ts:198–204` (spec-byte-floor guard).

## Acceptance Criteria

- [ ] `src/engine/run-cycle.ts` contains a diff check after build/fix steps that exits non-zero when no src/ files changed
- [ ] A test in `tests/engine/` covers the zero-diff case for build and fix steps
- [ ] `npm test` passes with no regressions
- [ ] Coverage does not drop below baseline
```

### Success Criteria
- [ ] File exists at the specified path with valid YAML frontmatter
- [ ] `id:` field matches filename slug

---

## Task 3: Create New Todo Issue — Artifact-only Commit Guard

### Overview
Create a fresh `todo/` issue for the missing artifact-only guard in `commit-trunk.sh`.

### Changes Required
**File**: `docs/cycle/issues/todo/refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh.md`

```markdown
---
id: refl-0108-artifact-only-commit-guard-absent-in-commit-trunk-sh
title: "Implement artifact-only commit guard in .cycle/scripts/commit-trunk.sh"
workflow: feature
depends_on: []
triaged_at: "2026-05-16T00:00:00.000Z"
source: triage
parent: ""
---
## Problem

`.cycle/scripts/commit-trunk.sh` exits 0 when nothing is staged (lines 62–65) but does not check whether staged files include any `src/` paths. A commit containing only artifact files (docs/cycle/, .cycle/engine.log, etc.) will succeed, producing a commit whose title implies implementation work but whose diff contains none.

This was originally tracked in `refl-0083-commit-trunk-sh-commits-artifact-only-ch.md` (now in done/) but the guard was never implemented. Cycle 0100 commit message claimed the fix landed but file inspection in cycle 0108 confirmed absence.

## Required Implementation

After the empty-cache check (line 62), add:
```bash
if ! git diff --cached --name-only | grep -q "^src/"; then
  echo "commit-trunk.sh: no src/ changes staged — artifact-only commit blocked"
  exit 1
fi
```

This exits non-zero for artifact-only commits, forcing the engine to surface the failure rather than silently land a misleading commit.

## Acceptance Criteria

- [ ] `.cycle/scripts/commit-trunk.sh` contains a `src/`-filter guard that exits non-zero for artifact-only staged indexes
- [ ] A test in `tests/` covers the artifact-only case (no src/ in staged files → exit 1)
- [ ] `npm test` passes with no regressions
- [ ] Coverage does not drop below baseline
```

### Success Criteria
- [ ] File exists at the specified path with valid YAML frontmatter
- [ ] `id:` field matches filename slug

---

## Task 4: Move Source Issue to Done

### Overview
Move `refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md` from `todo/` to `done/`. Same filename, different directory. No content changes.

### Changes Required
**Operation**: `git mv docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md docs/cycle/issues/done/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md`

### Success Criteria
- [ ] File exists at `docs/cycle/issues/done/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md`
- [ ] File no longer exists in `docs/cycle/issues/todo/`
- [ ] File content unchanged

---

## Task 5: Verify No Regressions

### Overview
Run `npm test` to confirm the four file operations (BUILD.md create, two issue creates, one issue move) introduced no regressions.

### Changes Required
None — read-only verification step.

### Success Criteria
- [ ] `npm test` exits 0
- [ ] Test count matches or exceeds 434 (no tests removed)
- [ ] No new compiler warnings from `npm run typecheck`

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] BUILD.md documents whether the empty-diff post-condition guard exists in \`src/engine/run-cycle.ts\`` | Task 1 | BUILD.md section "Empty-diff post-condition guard — Status: ABSENT" with file:line refs |
| `[ ] BUILD.md documents whether the artifact-only guard (no src/ changes → exit non-zero) exists in \`.cycle/scripts/commit-trunk.sh\`` | Task 1 | BUILD.md section "Artifact-only commit guard — Status: ABSENT" with lines 62–65 quoted |
| `[ ] If either guard is absent: a new issue file exists in \`docs/cycle/issues/todo/\` describing the missing guard implementation` | Tasks 2 & 3 | Both guards absent → two issues created, one per guard |
| `[ ] \`docs/cycle/issues/todo/refl-0081-cycle-0081-drained-done-with-placeholder-historical-context.md\` is moved to \`docs/cycle/issues/done/\`` | Task 4 | `git mv` preserves filename and content |
| `[ ] All existing tests still pass` | Task 5 | `npm test` required post-move |
| `[ ] No compiler/linter warnings introduced` | Task 5 | `npm run typecheck` exits 0 |

---

## Testing Strategy

### Unit Tests
None required — SPEC explicitly states "No new tests required; this is a verification and documentation cycle."

### Integration / E2E Tests
- `npm test` (434 tests) must pass after Tasks 1–4 complete
- Manual check: `ls docs/cycle/issues/todo/ | grep refl-0081` should return empty; `ls docs/cycle/issues/done/ | grep refl-0081` should return the file

## Risk Assessment
- **Issue filename slug collision**: New issue filenames use `refl-0108-` prefix — no existing files with that prefix in `todo/`. No collision risk.
- **`git mv` in non-interactive build env**: `git mv` is a safe rename; no destructive flag. If the done/ directory doesn't exist the command fails loudly — confirmed it exists via research.
- **npm test flakiness**: Zero src/ changes means zero risk of test regressions from code changes. Only risk is pre-existing flakiness.
