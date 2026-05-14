---
id: refl-0046-sync-defaults-clobbers-local-trunk-based-guard-sync-defaults-against-divergent-files
title: Guard `npm run sync-defaults` against clobbering locally-divergent files
workflow: feature
depends_on: [refl-0046-sync-defaults-clobbers-local-trunk-based-hotfix-restore-workflows-yml-divergence]
triaged_at: "2026-05-14T17:00:46.864Z"
source: triage
parent: refl-0046-sync-defaults-clobbers-local-trunk-based
---
## Problem

`scripts/sync-defaults.mjs` copies `src/defaults/` → `.cycle/` unconditionally. It has no awareness that some `.cycle/*` files are intentionally divergent from their source-of-truth counterparts in `src/defaults/`. The cycle 0046 incident proved this is not a hypothetical: an agent running `sync-defaults` to propagate one file silently overwrote `.cycle/workflows.yml`'s trunk-based divergence (see sibling hotfix child for full incident summary).

This cycle adds a guard so the next agent that runs `sync-defaults` cannot recreate the same failure mode — even after the hotfix restores the file.

## Approach (pick one in spec; both are acceptable)

**(a) Skip list.** `sync-defaults.mjs` reads a list of paths (e.g., `scripts/sync-defaults.skiplist` or an inline constant) and skips copying them. Documented in CLAUDE.md and referenced by the comment block at the top of `.cycle/workflows.yml`. Simple, opaque on first read.

**(b) Content-hash guard.** `sync-defaults.mjs` records a sha256 of each `.cycle/*` file at last-sync time (e.g., to `.cycle/.sync-state.json`). On subsequent runs, if a destination file's current hash differs from its recorded last-sync hash AND from the candidate source hash, the file is treated as locally divergent: the script prints a warning, lists the divergent paths, and refuses to overwrite them without `--force`. More principled, slightly more code, also catches accidental local edits to non-divergent files.

Option (b) is the more durable choice and surfaces a broader class of bugs; pick it unless the spec step uncovers a blocking reason.

## Acceptance criteria

1. Running `npm run sync-defaults` against a clean repo (no divergence) still copies every `src/defaults/*` to `.cycle/*` unchanged (no behavior regression for the common case).
2. Running `npm run sync-defaults` when `.cycle/workflows.yml` is in its trunk-based divergent state (post-hotfix) does NOT overwrite that file. The script exits with a clear, agent-readable message identifying every protected/divergent path it skipped.
3. The script provides an explicit override (e.g., `--force` flag or `CYCLE_SYNC_DEFAULTS_FORCE=1` env var) that bypasses the guard for the rare case an operator genuinely wants to re-baseline. Agents should not be expected to use this.
4. CLAUDE.md is updated to describe the guard contract: how divergence is declared (or auto-detected, under approach (b)), how `sync-defaults` behaves when it sees a divergent file, and how to override.
5. New unit tests cover: (i) clean sync (no divergence, all files copied), (ii) divergent-file sync (file preserved, warning emitted, exit code communicates skip count), (iii) `--force` override (file overwritten, warning suppressed or downgraded). Coverage thresholds held.
6. The hotfix sibling's regression test on `.cycle/workflows.yml` continues to pass.

## Out of scope

- The durable runtime-override fix that eliminates the divergence entirely (sibling child).
- Generalizing to other config files outside the `src/defaults/ → .cycle/` flow.

## Notes

- This cycle depends on the hotfix landing first so there is an actual divergent file for the guard to protect on day one.
- If approach (b) is chosen, `.cycle/.sync-state.json` should be gitignored — it's a per-clone bookkeeping file, not a source-of-truth artifact.
- Keep the guard self-contained in `scripts/sync-defaults.mjs`. No engine-side changes required.
