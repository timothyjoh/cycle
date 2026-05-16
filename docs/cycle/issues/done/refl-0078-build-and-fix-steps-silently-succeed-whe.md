---
id: refl-0078-build-and-fix-steps-silently-succeed-whe
title: Add empty-diff post-condition guard to build and fix steps
workflow: feature
depends_on: []
triaged_at: "2026-05-15T23:02:32.250Z"
source: triage
---
## Problem

When a `build` or `fix` step agent is blocked by a permission prompt mid-run, it writes a placeholder like "Permission needed for file writes" to its artifact and exits 0. The engine records `step.end status:ok`. The `verify` step (`npm test`) passes trivially because no code changed. The cycle closes `cycle.end status:ok` with zero implementation.

Cycle 0078 demonstrated this end-to-end: build step exited ok at 22:51:48, verify passed at 22:56:36, commit staged only artifact files. The `SPEC_MIN_BYTES` guard catches short `SPEC.md` output but there is no analogous guard for `build` or `fix`.

## Proposed fix

In `src/engine/run-cycle.ts`, after the agent exits for `build` and `fix` steps on branch-based workflows, run `git diff HEAD` on the cycle branch. If the diff is empty, flip `r.status = "failed"` with a descriptive stderr before `step.end` emits:

```
build post-condition failed: no code changes detected (git diff HEAD is empty)
fix post-condition failed: no code changes detected (git diff HEAD is empty)
```

This is directly analogous to the existing `SPEC_MIN_BYTES` guard and `formatSpecGuardError` helper.

## Implementation notes

- Touch only `src/engine/run-cycle.ts`.
- Export a constant (e.g. `EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string>`) containing `"build"` and `"fix"` — the single source of truth for which steps get this guard.
- Export a helper `formatBuildGuardError(stepName: string): string` for testability, mirroring `formatSpecGuardError`.
- Guard fires AFTER the existing artifact write so `BUILD.md` / `FIX.md` placeholder text is preserved for operator inspection.
- Skip guard entirely when `workflow.no_branch === true` (dogfood trunk-based path; diff baseline differs).
- Skip guard for bash agents (`step.agent === "bash"`) — same bypass pattern as `SPEC_MIN_BYTES`.
- Run `git diff HEAD` via `spawnSync` with array args (no `shell: true`), consistent with subprocess discipline.

## Acceptance criteria

1. `build` step agent exits 0 with empty `git diff HEAD` → `step.end status:failed`, stderr contains `"build post-condition failed: no code changes detected"`.
2. `fix` step agent exits 0 with empty `git diff HEAD` → `step.end status:failed`, stderr contains `"fix post-condition failed: no code changes detected"`.
3. `build` or `fix` step that produces a non-empty diff is unaffected (`step.end status:ok`).
4. `no_branch: true` workflow bypasses the guard entirely (no `git diff` invocation, no status flip).
5. Bash agent `build`/`fix` steps bypass the guard.
6. `BUILD.md` / `FIX.md` artifact is written before the guard fires; placeholder text survives in the artifact even when the guard flips status to failed.
7. Tests cover: empty-diff → failed (build), empty-diff → failed (fix), non-empty-diff → ok, `no_branch:true` bypass, bash-agent bypass.
8. Coverage must not drop below master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
