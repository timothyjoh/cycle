---
id: refl-0040-orphaned-cycle-branches-from-aborted-run
source: reflection
title: orphaned-cycle-branches-from-aborted-runs
added_at: "2026-05-14T03:39:14.265Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0040"
---

Cycle 0038 (`pr`-step failure) and 0039 (engine restart during `research`) left behind real `cycle/feature/define-enforce-restart-policy-for-build` branch state with no automatic cleanup; SPEC §Out of Scope explicitly calls out "Auto-recovery of orphaned cycle branches from prior aborted runs" as deferred. As the queue churns through retries the local refspace accumulates stale `cycle/<workflow>/<slug>` branches.

Individually harmless today because `createCycleBranch` reuses the same branch name, but the orphaned branches still hold partial agent work that the new Policy-1 reset only wipes if a `build` actually resumes; an aborted `spec`/`research`/`plan` leaves the cycle branch dirty forever. Over time this clutters `git branch` output and risks confusion if a slug is reused across distinct issues.

Direction: define an engine-level housekeeping pass (CLI flag or one-shot subcommand) that lists `cycle/*` branches with no matching `in_progress` row in `tbd.jsonl` and offers deletion. Pair with a CLAUDE.md note about manual cleanup until automation lands.
