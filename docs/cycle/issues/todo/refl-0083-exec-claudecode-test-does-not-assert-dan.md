---
id: refl-0083-exec-claudecode-test-does-not-assert-dan
title: Add --dangerously-skip-permissions assertion to exec-claudecode test 1
workflow: feature
depends_on: []
triaged_at: "2026-05-16T01:45:22.824Z"
source: triage
---
## Problem

`tests/engine/exec-claudecode.test.ts:17-22` creates a fake `claude` binary that echoes all args via `$@` to stdout. Test 1 asserts only `/SPECCED/` — the assertion passes regardless of whether `--dangerously-skip-permissions` appears in the spawned args.

A regression that drops the flag from `src/engine/exec-claudecode.ts` would pass the full test suite silently. This exact failure mode blocked 4 consecutive cycles (0079, 0081, 0082, 0083).

## Fix

In `tests/engine/exec-claudecode.test.ts`, add a second `assert.match` after the existing `/SPECCED/` assertion in test 1:

```ts
assert.match(r.stdout, /--dangerously-skip-permissions/);
```

This pins the flag's presence in the spawned args so any future regression is caught at test time.

## File

`tests/engine/exec-claudecode.test.ts` — test 1, after line ~22.

## Acceptance Criteria

- Test 1 in `tests/engine/exec-claudecode.test.ts` asserts `r.stdout` matches `/--dangerously-skip-permissions/`
- `npm test` passes
- Removing `--dangerously-skip-permissions` from `src/engine/exec-claudecode.ts` causes test 1 to fail
