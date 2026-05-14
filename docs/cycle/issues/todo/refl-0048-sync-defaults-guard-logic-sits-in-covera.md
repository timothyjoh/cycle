---
id: refl-0048-sync-defaults-guard-logic-sits-in-covera
title: Drop `scripts/**` coverage exclusion so sync-defaults guard logic is instrumented
workflow: feature
depends_on: [refl-0048-plan-vs-impl-drift-on-conditional-state]
triaged_at: "2026-05-14T17:25:31.546Z"
source: triage
---
## Problem

`package.json` test:coverage passes `--test-coverage-exclude='scripts/**'`, so the ~135 lines of divergence-guard logic added to `scripts/sync-defaults.mjs` in cycle 0048 are not instrumented. The 98.61 / 92.01 / 96.32 line / branch / function numbers in BUILD.md reflect `src/` only — they do not vouch for the guard.

REVIEW.md (cycle 0048) flagged four real untested branches in the guard:

1. `loadState` malformed-JSON fallback (lines 50-58) — returns `{}` when `.cycle/.sync-state.json` is corrupt.
2. `discoverPairs` ENOENT path (lines 71-75) — graceful exit when `src/defaults/` is missing.
3. `--force` on a clean repo — silent-warning path (no divergent paths to overwrite, but force flag still set).
4. Prior-state-entry preservation across a skip — SPEC invariant that a skipped path's existing `.sync-state.json` entry is left untouched.

## Why this matters

The guard is data-loss-prevention code. It exists because cycle 0046 silently re-clobbered local trunk-based divergence in `.cycle/workflows.yml`. An untested branch in this exact code (e.g. a refactor that deletes `state[to]` on skip, breaking the prior-entry invariant) would silently regress and only be discovered by a repeat 0046-style incident.

Coverage exclusion is hiding the regression surface.

## Suggested direction (from reflection)

Prefer: **drop the `scripts/**` exclusion** in `package.json`'s `test:coverage` script and let real coverage numbers surface the four gaps. The new test added in cycle 0048 already exercises the script E2E via `spawnSync`, so the exclusion has lost its original justification (it was a holdover from when `scripts/` held only build/bundle glue).

Alternative: keep the exclusion and add targeted spawn-based tests for the four named branches.

## Acceptance

- `npm run test:coverage` includes `scripts/sync-defaults.mjs` in its report.
- Each of the four named branches is exercised by at least one test:
  - malformed `.sync-state.json` → `loadState` returns `{}` and run proceeds.
  - missing `src/defaults/` → `discoverPairs` returns empty list, no error thrown, exit 0.
  - `--force` flag with no divergent destinations → stderr line is suppressed (or matches the documented clean-repo shape), exit 0.
  - Skipped (divergent) destination's prior `.sync-state.json` entry is unchanged after the run.
- Coverage thresholds in CLAUDE.md (line ≥ 95 %, branch ≥ 75 %, function ≥ 90 %) hold or improve once `scripts/sync-defaults.mjs` is in the numerator.

## Sequencing note

Depends on `refl-0048-plan-vs-impl-drift-on-conditional-state` because that issue decides whether the sync-state write on a skipped path is conditional or unconditional — the tests for branch #4 must pin the resolved behavior, not the current ambiguous one.

## Origin

Reflection from cycle 0048 (`origin_cycle_id: 0048`, `priority_hint: 5`).
