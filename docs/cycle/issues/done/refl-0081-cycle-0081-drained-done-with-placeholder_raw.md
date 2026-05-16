---
id: refl-0081-cycle-0081-drained-done-with-placeholder
source: reflection
title: cycle 0081 drained done with placeholder artifacts — traceability gap in git log
added_at: "2026-05-16T00:32:47.225Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0081"
---

Cycle 0081 closed `cycle.end status:ok` and committed under the message 'Apply the reflection-before-commit reorder that cycle 0078 failed to execute', but BUILD.md reads 'Waiting for permission grants' and FIX.md reads 'Need write permission'. The git commit is a lie: `git log` will permanently record the reorder as shipped in cycle 0081 when it was not.

The pattern is the same as cycle 0080 (tracked in `todo/refl-0080-cycle-0080-commit-title-describes-featur.md`): when build/fix steps produce only placeholder text, the commit captures that placeholder as an artifact but the commit title is pulled from the issue title, not from the actual diff. Until the empty-diff guard lands (`todo/refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks.md`), every permission-blocked cycle will corrupt the git traceability record.

Suggested direction: once the empty-diff guard is implemented, add a smoke-test assertion that `git diff HEAD~1...HEAD` is non-empty after any `build` or `fix` step that reports `status:ok`.
