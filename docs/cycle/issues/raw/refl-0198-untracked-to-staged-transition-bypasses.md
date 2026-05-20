---
id: refl-0198-untracked-to-staged-transition-bypasses
source: reflection
title: untracked-to-staged transition bypasses pre-snapshot filter
added_at: "2026-05-20T04:47:36.243Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0198"
---

The prePaths loop skips `??` (untracked) lines from the pre-snapshot. If a build agent creates an untracked file (`??` in pre-snapshot) and then the doc step stages that same file (status `A ` in post-snapshot), the file is absent from `prePaths` (was skipped as `??`) yet present in `toAppend` — so it gets incorrectly appended as a doc-step artifact.

This is an edge case: it requires the doc step to explicitly `git add` a pre-existing untracked file, which is uncommon but possible if a doc-step bash script runs `git add` as part of its workflow. The SPEC's intent is "only paths the documentation step itself modified," but a pre-existing untracked file staged during the doc step would pass the current filter.

Suggested fix: treat untracked files in the pre-snapshot as pre-existing by recording their paths separately (e.g., a `preUntracked` set) and skipping them in toAppend even if they appear as staged in the post-snapshot.
