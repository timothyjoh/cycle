---
id: refl-0188-appenddocumentationpaths-reads-full-work
title: "appendDocumentationPaths: isolate doc-step-only changes via pre/post snapshot diff"
workflow: feature
depends_on: []
triaged_at: "2026-05-19T18:15:16.482Z"
source: triage
---
## Problem

`appendDocumentationPaths` calls `git status --porcelain` after the documentation step completes. At that point the working tree also contains staged paths from the build step and any other prior steps. Any path the build agent forgot to declare in BUILD.md Touched Files gets silently added by `appendDocumentationPaths` before `scopeGuard` runs, causing `scopeGuard` to pass even when the build agent's Touched Files declaration is incomplete.

This masks the root cause tracked in `refl-0187-build-step-omits-test-file-changes-from`: the build agent is still emitting incomplete Touched Files declarations, but the symptom (scopeGuard failure) is eliminated before it surfaces.

## Root Cause

`appendDocumentationPaths` captures the full working-tree state, not just paths modified by the documentation step. It cannot distinguish between:
- Files staged by the build agent in an earlier step
- Files modified by the documentation agent in the current step

Because all prior steps have already run, the porcelain output conflates both sets into a single dirty-file list.

## Fix

**Option A (recommended): pre/post snapshot diff**

Snapshot `git status --porcelain` immediately before the documentation step executes. After the step completes, diff the two snapshots to isolate the paths the documentation step actually modified. Only append those delta paths to BUILD.md Touched Files.

This requires threading the pre-step snapshot into the `appendDocumentationPaths` call. The snapshot can be captured in `run-cycle.ts` just before the documentation step is dispatched, then passed as an argument (or via the step context) to the append function.

**Option B: working-tree-only filter (simpler but fragile)**

Restrict the appended set to working-tree-dirty-but-not-staged paths (Y-column dirty, X-column clean in porcelain XY format). The documentation agent typically writes files without staging them, so this would exclude build-step staged paths. Simpler than Option A but relies on an unstated behavioral assumption about all documentation agents.

Option A is preferred: it is provably correct regardless of whether the documentation agent stages files, and does not require reasoning about agent staging behavior.

## Acceptance Criteria

- `appendDocumentationPaths` only appends paths the documentation step itself modified (not pre-existing dirty paths from prior steps)
- Build-agent-staged paths present before the documentation step are not included in the appended set
- If the documentation step modifies no files, nothing is appended
- scopeGuard failures caused by incomplete build-agent Touched Files declarations are no longer silently masked by `appendDocumentationPaths`
- Unit tests cover the pre/post snapshot isolation: a test with pre-existing dirty files must confirm they are excluded from the appended set
- Existing `appendDocumentationPaths` tests are updated to reflect the new snapshot-diff contract
