---
id: refl-0187-scopeguard-does-not-skip-deleted-files-f
source: reflection
title: scopeGuard does not skip deleted files from issue lifecycle transitions
added_at: "2026-05-19T17:20:59.927Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0187"
---

In `commit-cycle.ts:68`, only `??` (untracked) entries are skipped. Deleted files (` D` working-tree status) pass through to the blocked-file check. When the engine moves a completed issue from `docs/cycle/issues/todo/` to `done/`, the deletion is unstaged and not listed in BUILD.md, so `scopeGuard` treats it as a scope violation.

The corresponding `done/` file appears as `??` and is correctly skipped, but the source deletion in `todo/` is not. Obs 2254 noted a fix was attempted but the current code at commit-cycle.ts:68 contains only the `??` skip — no deletion exemption. The second attempt of cycle 0187 has `docs/cycle/issues/todo/refl-0108-empty-diff-post-condition-guard-absent-in-run-cycle-ts.md` as a deleted-but-unstaged file that will block commit.

Fix direction: add `if (xy[1] === 'D' || xy[0] === 'D') continue;` after the `??` check, or limit scope guard to only additions and modifications (not deletions). Engine-managed lifecycle deletions should never be treated as build scope violations.
