---
id: refl-0029-fix-step-produced-empty-fix-md-despite-r
source: reflection
title: fix-step-produced-empty-fix-md-despite-real-fixes-landing
added_at: "2026-05-13T21:45:56.624Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0029"
---

`docs/cycle/0029-…/FIX.md` is a single blank line, yet the diff shows MUST-FIX Tasks 1 and 2 were actually applied: `child.on("error", …)` was added to `claudecodeExec.runStep` and a real-dispatch happy-path test was added to `tests/engine/triage.test.ts`. The fix step's `step.end status:ok` claim is therefore not corroborated by any on-disk artifact — operators cannot tell from artifacts which MUST-FIX tasks closed, which deferred, and which were silently dropped (Task 3 was deferred, Task 4 was dropped).

Why it matters: BUILD.md and FIX.md are the only structured trail the reflection step and future triage agents have for what actually happened inside a cycle. An empty FIX.md degrades that signal — reflection has to reconstruct intent from `git diff` and guess at which MUST-FIX items closed. It also breaks the symmetry advertised in CLAUDE.md ("Report coverage numbers… in BUILD.md and FIX.md outputs").

Direction: make the fix prompt require non-empty FIX.md whenever any MUST-FIX task exists, enumerating each task as `closed | deferred (-> filed-raw-id) | dropped (with reason)`, and have the engine fail the fix step if MUST-FIX.md has unchecked tasks and FIX.md is empty.
