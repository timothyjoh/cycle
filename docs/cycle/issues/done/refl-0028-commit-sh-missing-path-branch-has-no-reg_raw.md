---
id: refl-0028-commit-sh-missing-path-branch-has-no-reg
source: reflection
title: commit-sh-missing-path-branch-has-no-regression-test
added_at: "2026-05-13T21:15:14.914Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0028"
---

The new `if [ ! -e "$path" ]` branch in `src/defaults/scripts/commit.sh:54-64` is the entire reason cycle 0028 shipped (REVIEW Finding 1). Verification was a manual dry-run against the live dirty tree. The project has no bash-script test harness, so a future edit that reintroduces unflagged `git add -- "$path"` on a staged-deletion path would not fail any unit test — only the next cycle's commit step against a tree containing a staged deletion.

Proposed direction: add a minimal `tests/defaults/commit_sh.test.ts` that drives `commit.sh` against an ephemeral repo via `spawnSync`, exercising both `D*` and `*D` worktree-missing cases plus a normal addition. Same `mkdtemp`/`spawnSync` pattern as existing engine tests; no new framework needed.
