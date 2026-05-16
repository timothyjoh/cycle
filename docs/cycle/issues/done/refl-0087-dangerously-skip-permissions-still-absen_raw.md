---
id: refl-0087-dangerously-skip-permissions-still-absen
source: reflection
title: dangerously-skip-permissions still absent after cycle 0087 commit
added_at: "2026-05-16T03:02:38.462Z"
triage_attempts: 0
priority_hint: 10
origin_cycle_id: "0087"
---

Cycle 0087 ran all steps (spec skipped, research/plan/build/review/fix/verify/commit all exit 0) and drained `refl-0086-dangerously-skip-permissions-fix-consume` as done. `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns nothing. Same for `tests/engine/exec-claudecode.test.ts`. The flag has been absent through cycles 0083–0087.

The BUILD.md and FIX.md both contain only permission-approval requests — the agent wrote request prose instead of applying edits, yet the build and fix steps still exited 0. The issue is now drained and no longer in the queue.

Two operator-direct edits required (apply from parent Claude Code session, not engine subprocess):
1. `src/engine/exec-claudecode.ts:13` → `spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {`
2. `tests/engine/exec-claudecode.test.ts` after `/SPECCED/` assertion → `assert.match(r.stdout, /--dangerously-skip-permissions/);`

Verify: `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13; `npm test` exits 0.
