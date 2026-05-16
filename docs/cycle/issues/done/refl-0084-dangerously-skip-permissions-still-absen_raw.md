---
id: refl-0084-dangerously-skip-permissions-still-absen
source: reflection
title: --dangerously-skip-permissions still absent from exec-claudecode.ts after cycle 0084 drain
added_at: "2026-05-16T02:03:37.810Z"
triage_attempts: 0
priority_hint: 10
origin_cycle_id: "0084"
---

Cycle 0084 was created specifically to apply the one-line fix to `src/engine/exec-claudecode.ts:13`. The cycle ran through all steps and drained as `ok`, but `git diff master...HEAD` is empty and `exec-claudecode.ts:13` still reads `spawn("claude", ["-p", prompt], {` — the flag is absent. BUILD.md contains only a permission error message; FIX.md documents 0 of 2 tasks completed.

The queue consumed the issue (`queue.drained outcome:ok`) despite zero code change landing. The fix must be re-filed and requires operator intervention: either approve write permissions interactively, manually apply `sed -i '' 's/spawn("claude", \["-p", prompt\]/spawn("claude", ["--dangerously-skip-permissions", "-p", prompt]/' src/engine/exec-claudecode.ts`, or add `Edit(src/**)` to `.claude/settings.local.json` before the next engine run.

This is the fifth consecutive cycle (0079, 0081, 0082, 0083, 0084) that has failed to land this change. Until it lands, every spawned Claude CLI subprocess remains permission-blocked.
