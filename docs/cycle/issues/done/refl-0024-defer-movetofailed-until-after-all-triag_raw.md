---
id: refl-0024-defer-movetofailed-until-after-all-triag
source: reflection
title: defer-moveToFailed-until-after-all-triage-failed-check
added_at: "2026-05-13T20:02:55.660Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0024"
---

`src/engine/triage.ts:225` calls `moveToFailed` inside the per-raw failure branch — running before the `failed.length === raws.length` whole-pass check at `:233`. Consequence surfaced by cycle 0024: when the engine pauses on `all_triage_failed`, every raw has already been renamed to `docs/cycle/issues/failed/<id>.md` with `failed_step: "triage"` stamped, even though no cycle was started and the operator hasn't decided whether to give up on those raws. This forced the README recovery flow into a convoluted `mv failed/<id>.md raw/<id>.md` restore loop just to let `cycle triage --dry-run` (which reads only `raw/`) see them again.

Deferring `moveToFailed` until after the whole-pass result is known would let raws stay in `raw/` on `engine.paused`, collapsing the recovery flow from "restore, edit, dry-run, re-fire" to "edit, dry-run, re-fire." `moveToFailed` would still run in the partial-failure path where some raws decomposed successfully — only the all-fail path would skip it. MUST-FIX.md Task 1 explicitly calls this out as a deferred engine cycle.

Suggested direction: split the per-raw failure handling so frontmatter `bumpAttempts` (and the per-attempt `triage.raw.failed` log events) still run on each attempt, but the `raw/ → failed/` rename is collected and only flushed when at least one raw decomposed cleanly. Update README + RFC-001 §5 + CLAUDE.md to drop the restore step once the code lands.
