---
id: refl-0068-commit-sh-case-2-not-a-regression-tripwi
source: reflection
title: commit-sh-case-2-not-a-regression-tripwire-on-current-git
added_at: "2026-05-15T19:34:54.791Z"
triage_attempts: 1
priority_hint: 3
origin_cycle_id: "0068"
---

`tests/defaults/commit_sh.test.ts:80-100` (Case 2 — unstaged worktree deletion, ` D` porcelain) was designed to fail when the `if [ ! -e "$path" ] … *D) git add -u …` branch in `src/defaults/scripts/commit.sh:59-64` is reverted, per SPEC 0068 acceptance line 34. BUILD.md cycle 0068 records that on the current local `git` version `git add -- <tracked-but-missing-path>` permissively records the deletion, so Case 2 passes even with the guard removed; only Case 1 (staged `D ` deletion) actually trips. REVIEW.md cycle 0068 flagged this as informational.

The `*D) git add -u` arm is therefore not guarded by an executable tripwire — it's defense-in-depth that depends on git behavior that may itself change. Either (a) strengthen Case 2 to assert against the explicit `git add -u` call path (e.g., via stderr/strace-style instrumentation, or by checking that the pre-`add` porcelain still shows ` D`), or (b) add a comment in the test marking Case 2 as behavioral-correctness coverage rather than regression coverage so a future reader doesn't mistakenly rely on it. SPEC acceptance criterion should also be updated to match observed git semantics.
