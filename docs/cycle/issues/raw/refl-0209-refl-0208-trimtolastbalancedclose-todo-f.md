---
id: refl-0209-refl-0208-trimtolastbalancedclose-todo-f
source: reflection
title: refl-0208-trimtolastbalancedclose todo file will land in todo/ without done/ archival
added_at: "2026-05-21T07:13:09.555Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0209"
---

The issue file `docs/cycle/issues/todo/refl-0208-trimtolastbalancedclose-still-fails-for.md` is currently untracked (`??` in git status) — it was triaged to `todo/` in this same session. Cycle 0209 fixed the described bug before that file was ever committed. The commit step will add the todo file to the repo, but because it was never a committed todo entry, the engine's issue-lifecycle archival logic (which deletes from `todo/` and writes to `done/`) has nothing to act on. Result: the issue lands in `todo/` committed and will be picked up as unresolved open work by the next triage pass, despite the fix already being in the same commit.

Fix: before the cycle-0209 commit, move `docs/cycle/issues/todo/refl-0208-trimtolastbalancedclose-still-fails-for.md` to `docs/cycle/issues/done/` so the committed state reflects the resolved lifecycle. Alternatively, the engine's commit step should detect source-issue files that are untracked-in-todo and archive them instead of staging them as new todo entries.
