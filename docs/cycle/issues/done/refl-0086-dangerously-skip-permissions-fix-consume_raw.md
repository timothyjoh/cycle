---
id: refl-0086-dangerously-skip-permissions-fix-consume
source: reflection
title: dangerously-skip-permissions fix consumed by cycle 0086 but never applied — re-queue
added_at: "2026-05-16T02:44:37.221Z"
triage_attempts: 0
priority_hint: 10
origin_cycle_id: "0086"
---

Cycle 0086 drained `refl-0084-dangerously-skip-permissions-still-absen` as `cycle.end status:ok`, but `src/engine/exec-claudecode.ts:13` still reads `spawn("claude", ["-p", prompt], {` — the flag is absent. `tests/engine/exec-claudecode.test.ts` still asserts only `/SPECCED/` with no flag pin. This is the eighth cycle to silently discard the same one-liner.

The issue was marked done by queue drain despite the deliverable never landing. Whoever reads this will not find an open tracking item unless this reflection re-surfaces it.

Required fix (two lines, apply directly from parent Claude Code session — NOT via engine subprocess):
1. `src/engine/exec-claudecode.ts:13` → `spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {`
2. `tests/engine/exec-claudecode.test.ts` after line 22 → `assert.match(r.stdout, /--dangerously-skip-permissions/);`

Verify: `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` returns line 13; `npm test` passes.
