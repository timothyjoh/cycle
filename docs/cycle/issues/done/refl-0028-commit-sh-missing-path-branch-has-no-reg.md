---
id: refl-0028-commit-sh-missing-path-branch-has-no-reg
title: Add regression test for commit.sh worktree-missing-path branch
workflow: feature
depends_on: []
triaged_at: "2026-05-13T21:16:44.740Z"
source: triage
---
## Context

Cycle 0028 shipped a new branch in `src/defaults/scripts/commit.sh:54-64`:

```sh
if [ ! -e "$path" ]; then
  # staged deletion: path no longer exists in worktree
  ...
fi
```

This branch is the entire reason the cycle merged (REVIEW Finding 1). Verification was a one-shot manual dry-run against the live dirty tree. There is no automated test guarding it.

## Risk

A future edit that reintroduces unflagged `git add -- "$path"` on a staged-deletion path would not fail any unit test. The regression would only surface on the next cycle whose commit step happens to encounter a staged deletion — a sparse, intermittent trigger.

## Proposed approach

Add `tests/defaults/commit_sh.test.ts` that drives `src/defaults/scripts/commit.sh` against an ephemeral git repo via `spawnSync`. Cover:

1. `D ` worktree-missing case (staged deletion, no worktree file) — must succeed without `git add` erroring on missing pathspec.
2. ` D` / `*D` worktree-missing case (unstaged deletion staged by commit.sh path) — must succeed.
3. Normal addition / modification — control case, must still succeed and produce the expected commit.

## Pattern

Reuse the existing engine test pattern: `node:fs.mkdtempSync` for the temp repo, `node:child_process.spawnSync` with array args to invoke the script, `git init` + seed commit in the fixture. No new test framework needed — Node's native test runner already used elsewhere in `tests/`.

## Acceptance

- New test file exists at `tests/defaults/commit_sh.test.ts` and runs via `npm test`.
- All three cases pass.
- Reverting the `if [ ! -e "$path" ]` branch in `commit.sh` causes case (1) and (2) to fail.
- Coverage gates still green (≥95 line / ≥75 branch / ≥90 func).
