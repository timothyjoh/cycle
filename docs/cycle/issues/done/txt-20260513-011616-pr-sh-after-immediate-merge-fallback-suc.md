---
id: txt-20260513-011616-pr-sh-after-immediate-merge-fallback-suc
source: text
title: "pr.sh: after immediate-merge fallback succeeds, delete the remote branch (gh pr merge --delete-branch only deletes when GitHub schedules the merge; the synchronous fallback path leaves origin/cycle/feature/* orphaned). Add explicit 'gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>' after successful fallback merge, with test coverage."
added_at: 2026-05-13T01:16:16.008Z
triage_attempts: 0
---

pr.sh: after immediate-merge fallback succeeds, delete the remote branch (gh pr merge --delete-branch only deletes when GitHub schedules the merge; the synchronous fallback path leaves origin/cycle/feature/* orphaned). Add explicit 'gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/<branch>' after successful fallback merge, with test coverage.
