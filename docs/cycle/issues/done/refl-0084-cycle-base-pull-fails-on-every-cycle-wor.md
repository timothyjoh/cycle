---
id: refl-0084-cycle-base-pull-fails-on-every-cycle-wor
title: "Fix .cycle/workflows.yml base branch: change `main` to `master`"
workflow: feature
depends_on: []
triaged_at: "2026-05-16T02:07:21.987Z"
source: triage
---
## Problem

Every cycle emits a `cycle.base_pull status:failed` event with reason `"git fetch origin main failed: fatal: couldn't find remote ref main"`. The `.cycle/workflows.yml` `base:` field is set to `main`, but this dogfood repo uses `master` as its trunk branch (confirmed by CLAUDE.md and `git log`).

The failure is silent — the engine logs it and continues — but every post-cycle fetch-and-merge is a no-op, and `.cycle/log.jsonl` accumulates spurious `status:failed` events that obscure real failures. Every single cycle run is affected.

## Fix

In `.cycle/workflows.yml`, change the `base:` field value from `main` to `master`.

Do NOT change `src/defaults/workflows.yml`. The shipped default should remain `main` since most consumer repos use `main` as their trunk. The dogfood `.cycle/workflows.yml` already diverges from defaults intentionally (protected by the sync-defaults divergence guard), so this one-line change is safe and will not be clobbered by future `npm run sync-defaults` runs.

## Verification steps

```sh
# Confirm current (broken) value
grep 'base:' .cycle/workflows.yml

# After fix: confirm git remote agrees
git remote show origin | grep 'HEAD branch'

# Confirm defaults unchanged
grep 'base:' src/defaults/workflows.yml
```

## Acceptance Criteria

1. `.cycle/workflows.yml` has `base: master` (or equivalent that resolves to the repo's actual default branch).
2. A subsequent dry-run (`cycle run --dry-run`) does not emit `cycle.base_pull status:failed` for a missing `main` ref.
3. `git remote show origin | grep "HEAD branch"` returns `master`, confirming the config matches reality.
4. `src/defaults/workflows.yml` is unchanged — its `base:` value stays `main`.
5. `npm test` passes (no regressions).

## Notes

- Related but distinct: `refl-0040-engine-base-branch-resolution-hardcodes` tracks an architectural fix to centralize base-branch resolution in engine code so it reads from workflow config rather than hardcoding. This issue is the immediate one-line config fix to stop the spurious failures now.
- Priority hint: 7 (from origin reflection). Queue it first — it's a one-liner with immediate log-quality impact.
- The sync-defaults divergence guard (`.cycle/.sync-state.json`) already tracks `.cycle/workflows.yml` as a protected divergent path, so this change survives future `npm run sync-defaults` invocations.
