---
id: refl-0227-commitcycle-re-discovers-artifactdir-via
title: Thread artifactDir into CommitCycleOpts to eliminate independent re-discovery
workflow: feature
depends_on: [redesign-04-footprint-json-and-scope-guard-demote]
triaged_at: "2026-05-21T14:43:40.849Z"
source: triage
---
## Problem

`src/engine/commit-cycle.ts:142–149` re-discovers the cycle artifact directory independently of `run-cycle.ts` by scanning `readdir(join(repoRoot, "docs/cycle"))` for the first entry matching `${opts.cycleId}-*`. Meanwhile `run-cycle.ts` already holds `artifactDir` and passes it directly to `accumulateTouchedFiles`, but does not thread it into `CommitCycleOpts`.

This dual-path discovery has two concrete failure modes:

1. **Silent empty footprint:** If `docs/cycle/` does not exist (fresh repo, or a cycle that failed before the `document` step created the dir), `commitCycle` falls back to an empty footprint set, causing a spurious `commit.scope_warning` for every staged `src/` file — even though the commit is legitimate.
2. **Prefix-scan fragility:** If two directories share the same `cycleId` prefix, the first `readdir` match wins non-deterministically. This is the same class of fragility that motivated removing `scopeGuard` in cycle 0227.

## Fix

Thread `artifactDir` (or equivalently `touchedJsonPath`) into `CommitCycleOpts` so `commitCycle` reads the path directly rather than re-discovering it.

### Steps

1. **Extend `CommitCycleOpts`** in `src/engine/commit-cycle.ts`: add an optional `artifactDir?: string` field.
2. **Replace the `readdir` scan** at lines 142–149 with a direct `join(opts.artifactDir, "touched.json")` read. If `opts.artifactDir` is absent or `touched.json` does not exist, keep the existing silent-skip fallback — just remove the fragile directory scan.
3. **Update call sites in `src/cli.ts`**: pass `artifactDir` from the `runCycle` return value. If `runCycle` does not currently return `artifactDir`, surface it (it is already computed internally from `prepareTrunkArtifactDir` / `checkoutCycleBranch`).
4. **Add a regression test** in `tests/engine/commit-cycle.test.ts` asserting that a commit on a cycle where `docs/cycle/` does not exist does **not** emit a spurious `commit.scope_warning` when `artifactDir` is supplied explicitly.

## Acceptance criteria

- `CommitCycleOpts.artifactDir` field exists and is used to load `touched.json`.
- The `readdir` prefix scan in `commitCycle` is fully removed — no fallback scan path remains.
- `runCycle` return type exposes `artifactDir` so call sites in `cli.ts` can forward it.
- New regression test passes; no existing `commit-cycle.test.ts` tests regress.
- Coverage for `src/engine/commit-cycle.ts` does not drop below the 95% floor.
