---
id: refl-0083-commit-trunk-sh-commits-artifact-only-ch
title: Block commit-trunk.sh commits when diff contains no src/ changes (artifact-only guard)
workflow: feature
depends_on: [refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks]
triaged_at: "2026-05-16T01:42:40.272Z"
source: triage
---
## Problem

When build or fix steps fail silently (e.g. permissions catch-22), the cycle produces only artifact files under `docs/cycle/<id>/` (SPEC/BUILD/REVIEW/FIX.md) and `.cycle/engine.log`. The empty-diff guard introduced in cycle 0080 checks for a completely empty diff — but `docs/` artifact additions count as real file changes, so the guard passes and `commit-trunk.sh` commits anyway.

Result: misleading commits. `b413b44` claimed to fix `exec-claudecode.ts` but touched only `docs/`, `.cycle/engine.log`, and issue management files. This pattern repeats on every permissions-blocked build cycle.

## Acceptance Criteria

- [ ] `commit-trunk.sh` (or the engine commit step) checks that the staged diff contains at least one file change under `src/`.
- [ ] When no `src/` changes are present, the script exits non-zero with a descriptive message (e.g. `commit blocked: no src/ changes in staged diff — artifact-only commit suppressed`).
- [ ] Commits with genuine `src/` changes are unaffected.
- [ ] The guard is covered by a shell test or the verify step asserts `git diff --name-only HEAD~1 HEAD | grep -q '^src/'`.
- [ ] CLAUDE.md architecture section updated to document the artifact-only guard alongside the empty-diff guard.

## Suggested Implementation

In `scripts/commit-trunk.sh`, after the existing empty-diff check, add:

```sh
if ! git diff --cached --name-only | grep -q '^src/'; then
  echo "commit blocked: no src/ changes in staged diff — artifact-only commit suppressed" >&2
  exit 1
fi
```

Alternatively, place the guard in the verify step as a post-condition so it runs before the commit step is reached.

Note: this item depends on `refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks` (base empty-diff guard) so both checks coexist in the same script cleanly.
