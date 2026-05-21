---
id: refl-0227-commitcycle-re-discovers-artifactdir-via
source: reflection
title: commitCycle re-discovers artifactDir via readdir prefix scan independent of run-cycle
added_at: "2026-05-21T14:40:57.128Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0227"
---

`src/engine/commit-cycle.ts:142–149` independently re-discovers the cycle artifact directory by calling `readdir(join(repoRoot, "docs/cycle"))` and finding the first entry matching `${opts.cycleId}-*`. Meanwhile `run-cycle.ts` has `artifactDir` directly and passes it to `accumulateTouchedFiles`.

This creates two independent discovery paths for the same resource. If `docs/cycle` is absent (e.g., on a fresh repo or a `document`-workflow cycle that failed before creating the dir), `commitCycle` silently falls back to an empty footprint set, causing `commit.scope_warning` for every staged `src/` file. It also inherits the same prefix-scan fragility as the deleted `scopeGuard`.

Suggested fix: thread `artifactDir` (or a `touchedJsonPath`) into `CommitCycleOpts` so `commitCycle` reads the path directly rather than rediscovering it. Both call sites in `cli.ts` already have access to `cycleId`; the corresponding `artifactDir` is computable from the existing `prepareTrunkArtifactDir` / `checkoutCycleBranch` return values if those are surfaced through `runCycle`'s return type.
