---
id: refl-0227-new-untracked-src-files-bypass-touched-j
title: Fix touched.json to include untracked new src/ files, or document the gap in ENGINE.md
workflow: feature
depends_on: []
triaged_at: "2026-05-21T15:11:43.809Z"
source: triage
---
## Problem

`parseSnapshotPaths` in `run-cycle.ts` processes lines from `git status --porcelain` output but silently skips `??` (untracked) lines. When an agent creates a new `src/` or `scripts/` file during a build or fix step, that file is invisible to `accumulateTouchedFiles`. At commit time, `stageFiles` uses `--untracked-files=all` and correctly stages the new file — but `touched.json` never records it. The commit scope-warning check in `commit-cycle.ts` also skips `??` lines, so no `commit.scope_warning` event fires for out-of-scope new files either.

The behavior is internally consistent (no double-counting, no false warnings) but silently incomplete: `touched.json` purports to be a full per-cycle footprint, yet any newly-created `src/` file is absent from it.

## Background

`touched.json` was introduced in cycle 0227 to give downstream consumers (reflection, review, analytics) a reliable per-cycle file footprint. The accumulation logic snapshots `git status --porcelain` before and after each RESET_ELIGIBLE_STEPS step, then diffs the two snapshots via `parseSnapshotPaths`. That function filters to `src/` and `scripts/` paths from standard change-code lines (`M`, `A`, `D`, `R`, etc.) — but `??` is not a standard change code; it indicates a file not yet tracked by git. The pre/post diff would correctly surface a `??` path that appears only in the post-snapshot, but `parseSnapshotPaths` never emits it.

Cycle 0227 REVIEW flagged this as internally consistent; the raw reflection issue confirms the coverage gap is real and undocumented.

## Fix options

**Option A — Document only (minimal, low risk)**

Add a note to the `touched.json` footprint section of `ENGINE.md` (under "Known Limitations") stating that `touched.json` records only modified/renamed/deleted tracked files and never newly-created untracked files. Callers relying on the footprint for completeness must account for scaffold-heavy workflows.

**Option B — Extend `parseSnapshotPaths` to include `??` lines (behavioral fix)**

Modify `parseSnapshotPaths` so that `??`-status lines whose path begins with `src/` or `scripts/` are emitted alongside normal change lines. The diff logic in `accumulateTouchedFiles` accumulates paths present in the post-snapshot but absent from the pre-snapshot — untracked files appear only in the post-snapshot, so they are picked up without further change. Also update the scope-warning path in `commit-cycle.ts` to include `??` paths so that an out-of-scope new file emits `commit.scope_warning`.

## Recommendation

Implement **Option B** (behavioral fix) plus update `ENGINE.md` to describe the corrected behavior. The `touched.json` footprint is most valuable when complete; silently omitting newly-created files defeats its purpose for any agent that scaffolds new source files. The fix is localized to `parseSnapshotPaths` (one function) and the scope-warning path in `commit-cycle.ts`. If the scope-warning interaction proves unexpectedly complex, fall back to Option A with a clear ENGINE.md note and a follow-up issue for Option B.

## Acceptance criteria

- `parseSnapshotPaths` includes `??`-status paths beginning with `src/` or `scripts/`.
- `accumulateTouchedFiles` correctly records a newly-created (untracked) `src/` file in `touched.json`.
- `commit-cycle.ts` scope-warning check covers `??`-status paths so out-of-scope new files emit `commit.scope_warning`.
- `ENGINE.md` documents the corrected behavior (or, if falling back to Option A, explicitly states the limitation).
- New tests cover: (a) untracked `src/` file appears in `touched.json`, (b) untracked out-of-scope `src/` path emits `commit.scope_warning`, (c) untracked path outside `src/`/`scripts/` is not included.
- All per-file coverage floors pass; `run-cycle.ts` and `commit-cycle.ts` coverage does not decrease.
