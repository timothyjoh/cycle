---
id: refl-0086-dangerously-skip-permissions-fix-consume
title: Re-apply --dangerously-skip-permissions to exec-claudecode.ts spawn (operator-direct)
workflow: feature
depends_on: []
triaged_at: "2026-05-16T02:47:35.491Z"
source: triage
---
## Context

This is the ninth attempt to land a two-line fix to `src/engine/exec-claudecode.ts`. Cycles 0079, 0081–0086 all discarded the change silently due to the bootstrapping catch-22: the engine subprocess attempting the fix is itself blocked by `settings.local.json` permission overrides that restrict write operations to git and Python commands only.

Cycle 0086 drained `refl-0084-dangerously-skip-permissions-still-absen` as `cycle.end status:ok` despite `src/engine/exec-claudecode.ts:13` still reading `spawn("claude", ["-p", prompt], {` — the flag is absent. `tests/engine/exec-claudecode.test.ts` still has no assertion pinning the flag.

## Required Fix

**OPERATOR ACTION REQUIRED — do not delegate to engine subprocess.**

Apply from the parent Claude Code session directly:

**Change 1** — `src/engine/exec-claudecode.ts` line 13:
```ts
// before
spawn("claude", ["-p", prompt], {
// after
spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {
```

**Change 2** — `tests/engine/exec-claudecode.test.ts` after line 22, add:
```ts
assert.match(r.stdout, /--dangerously-skip-permissions/);
```

## Verification

```sh
grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts
# must return line 13

npm test
# must pass
```

## Why This Keeps Failing

`settings.local.json` overrides the global `settings.json` and restricts allowed tools to git and Python commands. The cycle engine spawns a Claude CLI subprocess to execute build/fix steps; that subprocess inherits the restrictive policy and cannot write to TypeScript source files. The fix cannot bootstrap itself via the engine — it must be applied directly by the operator.

## Acceptance Criteria

1. `src/engine/exec-claudecode.ts:13` contains `"--dangerously-skip-permissions"` as the first element of the args array.
2. `tests/engine/exec-claudecode.test.ts` contains an `assert.match` call verifying `--dangerously-skip-permissions` appears in the fake-claude stdout capture.
3. `npm test` exits 0 with all assertions passing.
