---
id: refl-0078-build-and-fix-steps-silently-succeed-whe
source: reflection
title: build-and-fix-steps-silently-succeed-when-agent-blocked-by-permission-gate
added_at: "2026-05-15T22:58:31.816Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0078"
---

When a `build` or `fix` step agent is blocked by a permission prompt mid-run, it writes a placeholder like "Permission needed for file writes" to its artifact and exits 0. The engine records `step.end status:ok`. The `verify` step (npm test) then passes trivially because no code changed. The cycle closes `cycle.end status:ok` with zero implementation.

This cycle (0078) demonstrates the failure mode end-to-end: build step exited ok at 22:51:48, verify passed at 22:56:36, commit staged only artifact files. The spec post-condition guard (`SPEC_MIN_BYTES`) catches short `SPEC.md` output but there is no analogous guard for `build` or `fix`. A `build` step that produces no `git diff` and a BUILD.md containing "Permission needed" should be treated as a failure, not success.

Suggested direction: add a post-condition check for the `build` step that reads `git diff HEAD` after the agent exits — if the diff is empty and the workflow is not `no_branch:true`, emit a `step.warning` or flip `r.status = "failed"` with a descriptive stderr. This is analogous to the existing `SPEC_MIN_BYTES` guard in `src/engine/run-cycle.ts:SPEC_MIN_BYTES`.
