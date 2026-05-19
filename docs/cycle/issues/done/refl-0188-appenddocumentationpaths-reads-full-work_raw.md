---
id: refl-0188-appenddocumentationpaths-reads-full-work
source: reflection
title: appendDocumentationPaths reads full working-tree diff not doc-step-only changes masking build-step omissions
added_at: "2026-05-19T18:12:43.980Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0188"
---

The function calls `git status --porcelain` after the documentation step completes. At that point the working tree also contains staged paths from the build step and any other prior steps. Any path the build agent forgot to declare in BUILD.md Touched Files will be silently added by `appendDocumentationPaths` before `scopeGuard` runs, causing `scopeGuard` to pass. This masks the root cause tracked in `refl-0187-build-step-omits-test-file-changes-from`: the build agent is still emitting incomplete Touched Files declarations, but the symptom (scopeGuard failure) is eliminated before it surfaces.

The least-invasive fix is to snapshot `git status --porcelain` immediately before the documentation step executes and diff the two snapshots to isolate paths the documentation step actually modified. Alternatively, restrict the appended set to working-tree-only modifications (Y-column dirty, X-column clean) since the documentation agent typically does not stage files.
