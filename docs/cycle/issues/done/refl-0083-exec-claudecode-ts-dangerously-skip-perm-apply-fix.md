---
id: refl-0083-exec-claudecode-ts-dangerously-skip-perm-apply-fix
title: Apply --dangerously-skip-permissions to exec-claudecode.ts spawn (operator-assisted)
workflow: feature
depends_on: []
triaged_at: "2026-05-16T01:50:33.909Z"
source: triage
parent: refl-0083-exec-claudecode-ts-dangerously-skip-perm
---
## Summary

One-line fix in `src/engine/exec-claudecode.ts:13`: add `--dangerously-skip-permissions` to the Claude CLI spawn args. This is the root cause of cycles 0079, 0081, 0082, and 0083 all committing zero `src/` changes despite reporting success.

## OPERATOR INTERVENTION REQUIRED

Do not assign this to the cycle engine. The engine's spawned subprocesses are blocked by `settings.local.json` overriding global Write/Edit permissions — the exact restriction this fix is meant to remove. Assigning to the engine will produce the same artifact-only commit pattern a fifth time.

A human operator must apply the change manually.

## The Fix

File: `src/engine/exec-claudecode.ts`, line 13

Change `spawn("claude", ["-p", prompt], {` to `spawn("claude", ["--dangerously-skip-permissions", "-p", prompt], {`.

## Verification

1. Run `npm test` — must pass. No test updates needed (confirmed by cycle 0083 RESEARCH.md).
2. `grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` must match on line 13.
3. Verify `refl-0083-exec-claudecode-test-does-not-assert-dan` (assertion test) can now pass alongside the fix.

## Context

Root cause: `settings.local.json` sets a restrictive permission policy that overrides the global settings, blocking spawned Claude CLI subprocesses from editing files under `src/`. The empty-diff guard (cycle 0080) passes because artifact files in `docs/` and `.cycle/` count as real changes, masking the silent no-op in `src/`. Four prior cycles (0079, 0081, 0082, 0083) all documented the catch-22 in their artifacts but produced no code changes for the same reason.

The artifact-only commit guard (`refl-0083-commit-trunk-sh-commits-artifact-only-ch`) will detect this pattern going forward, but the root cause must be fixed directly first.

Related: `refl-0082-settings-local-json-overrides-global-wri` (source issue, incorrectly marked done after cycle 0083 drain). Origin cycle: 0083.
