---
id: refl-0187-scopeguard-does-not-skip-deleted-files-f
title: scopeGuard must skip deleted files from engine-managed issue lifecycle transitions
workflow: feature
depends_on: []
triaged_at: "2026-05-19T17:23:28.296Z"
source: triage
---
## Problem

`scopeGuard` in `src/engine/commit-cycle.ts:68` only skips `??` (untracked) entries. Deleted files (` D` working-tree status) pass through to the blocked-file check. When the engine moves a completed issue from `docs/cycle/issues/todo/` to `done/`, the deletion is unstaged and not listed in `BUILD.md`, so `scopeGuard` treats it as a scope violation.

The corresponding `done/` file appears as `??` and is correctly skipped, but the source deletion in `todo/` is not — producing a false scope violation on every successful cycle commit that involves an issue lifecycle transition.

Observed in cycle 0187: `docs/cycle/issues/todo/refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md` appeared as a deleted-but-unstaged file and blocked the first commit attempt.

## Fix Direction

In `src/engine/commit-cycle.ts`, after the `??` skip at line 68, add a guard for deleted entries:

```typescript
if (xy.startsWith('??')) continue;             // untracked — already present
if (xy[0] === 'D' || xy[1] === 'D') continue;  // deleted — engine-managed lifecycle
```

Alternatively, limit scope guard to additions and modifications only. Engine-managed lifecycle deletions (`todo/` → `done/` transitions) must never constitute build scope violations.

## Acceptance Criteria

- `scopeGuard` does not raise a violation for any file with `D` in either column of the git status `xy` field.
- Existing `??` (untracked) skip behavior is preserved.
- A unit test covers the deleted-file case: mock a ` D` status entry for a `docs/cycle/issues/todo/` path and assert no scope violation is raised.
- All existing tests continue to pass; line, branch, and function coverage do not decrease from baseline.
