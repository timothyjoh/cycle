---
id: refl-0039-within-budget-drainretry-arm-leaves-no-p
source: reflection
title: within-budget drainRetry arm leaves no persisted residue context across a crash
added_at: 2026-06-03T09:04:02.203Z
triage_attempts: 0
priority: low
origin_cycle_id: "0039"
---

Cycle 0039 persists `pendingResidueContext` to `.cycle/failed-residue-context.json` at the four terminal-failure branches (resume-terminal, commit-failed, fast-bail, attempts-exhausted), but the within-budget `drainRetry` arm (cycle 0038, `src/cli.ts:871`) still arms the context in memory only. A process that crashes after a within-budget retry is queued but before it re-runs leaves uncommitted residue with no persisted context, so a fresh engine start does not re-check it — the exact silent-stack-on-residue failure the guard exists to prevent. BUILD.md flags this under "Deferred / follow-up" and docs note it as the remaining limitation, but it is not yet filed as a tracked issue.

The fix is mechanically symmetric to what this cycle already did: call `persistResidue(pendingResidueContext)` adjacent to the in-memory set at the drainRetry arm, and confirm the existing clear sites already cover the on-disk delete for that path. Narrow window (within-budget retries are uncommon and the crash must land between queue-and-rerun), hence low priority — but it is the one durability hole that keeps the guard from being fully crash-safe.
