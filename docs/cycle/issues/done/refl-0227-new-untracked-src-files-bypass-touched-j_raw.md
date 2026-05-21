---
id: refl-0227-new-untracked-src-files-bypass-touched-j
source: reflection
title: new untracked src/ files bypass touched.json accumulation and commit.scope_warning silently
added_at: "2026-05-21T15:05:32.564Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0227"
---

`parseSnapshotPaths` skips `??` (untracked) lines, so a brand-new `src/` file created by an agent — not yet `git add`-ed — is excluded from `touched.json` accumulation during `accumulateTouchedFiles`. At commit time, `stageFiles` uses `--untracked-files=all` and DOES pick up the file. But `commit-cycle.ts` also skips `??` in the scope-warning check. The result: a newly-created `src/` file is staged, committed, and absent from both `touched.json` and any `commit.scope_warning` emission.

This is internally consistent (REVIEW noted it) but the `touched.json` footprint record is silently incomplete for workflows that scaffold new source files rather than modifying existing ones. The missing coverage is undocumented. Either extend `parseSnapshotPaths` to track `??` lines for `src/`/`scripts/` paths, or add an explicit note to the ENGINE.md schema section that `touched.json` covers only modified/renamed files and never newly-created untracked files.
