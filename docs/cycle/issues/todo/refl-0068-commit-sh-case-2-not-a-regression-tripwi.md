---
id: refl-0068-commit-sh-case-2-not-a-regression-tripwi
title: Clarify or strengthen commit.sh Case 2 (unstaged ` D` worktree-deletion) tripwire coverage
workflow: feature
depends_on: []
triaged_at: "2026-05-15T19:40:24.985Z"
source: triage
---
## Problem

`tests/defaults/commit_sh.test.ts:80-100` (Case 2 — unstaged worktree deletion, ` D` porcelain) was designed by SPEC 0068 acceptance line 34 to fail when the `if [ ! -e "$path" ] … *D) git add -u …` branch in `src/defaults/scripts/commit.sh:59-64` is reverted. BUILD.md cycle 0068 records that on the current local `git` version `git add -- <tracked-but-missing-path>` permissively records the deletion, so Case 2 passes even with the guard removed; only Case 1 (staged `D ` deletion) actually trips. REVIEW.md cycle 0068 flagged this as informational.

The `*D) git add -u` arm is therefore not guarded by an executable tripwire — it's defense-in-depth against git versions/configurations where `git add -- <missing-path>` would error or no-op, but the test as written cannot detect a regression that removes the arm on the developer's current git.

## Acceptance

Pick **one** of:

1. **Strengthen Case 2 to a real tripwire.** Make the test assert against the explicit `git add -u <path>` call path — e.g.,
   - shim `git` on `PATH` for the test and assert the `add -u` invocation occurred, or
   - assert that pre-`add` porcelain was ` D` and that the recorded change matches the `add -u` semantics rather than relying on stage-success alone, or
   - if a portable strengthening proves infeasible, fall back to option 2.
2. **Mark Case 2 as behavioral coverage, not regression coverage.** Add a comment at `tests/defaults/commit_sh.test.ts:80` explaining that on permissive git versions Case 2 passes whether or not the `*D)` arm is present; the test pins observed behavior, Case 1 is the regression tripwire for the guard. Update SPEC 0068 acceptance line 34 wording to match observed git semantics so a future reader doesn't expect a tripwire that doesn't exist.

Either outcome closes the gap. Document the choice in BUILD.md / SPEC update so the rationale survives.

## Source

- Raw: `refl-0068-commit-sh-case-2-not-a-regression-tripwi` (cycle 0068 reflection, priority_hint 3)
- BUILD.md cycle 0068 — observed permissive `git add` behavior
- REVIEW.md cycle 0068 — informational flag
- SPEC 0068 acceptance line 34 — original tripwire intent
