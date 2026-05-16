---
id: refl-0083-commit-trunk-sh-commits-artifact-only-ch
source: reflection
title: commit-trunk.sh commits artifact-only changesets without detecting absent source changes
added_at: "2026-05-16T01:38:46.832Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0083"
---

When build and fix steps fail silently (permissions catch-22), they produce only cycle artifact files (SPEC/BUILD/REVIEW/FIX.md under `docs/cycle/<id>/`). The empty-diff guard added in cycle 0080 checks for a truly empty diff — but docs/ artifacts are real file additions, so the guard passes and commit-trunk.sh commits anyway.

The result is misleading commits: `b413b44` claims to fix `exec-claudecode.ts` but touches only `docs/`, `.cycle/engine.log`, and issue management files. This pattern will repeat on every permissions-blocked build cycle.

Suggested direction: extend the empty-diff guard (or add a separate post-condition in the commit step) to check whether the diff contains at least one change under `src/`. A commit that modifies only `docs/cycle/` and `.cycle/` artifacts should emit a warning or block the commit. The verification step is an alternative location for this check — `npm test` already passes in these cases, so an explicit `git diff --name-only HEAD~1 HEAD | grep -q '^src/'` assertion would catch the gap.
