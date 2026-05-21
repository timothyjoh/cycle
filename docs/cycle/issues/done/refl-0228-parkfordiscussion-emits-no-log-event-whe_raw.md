---
id: refl-0228-parkfordiscussion-emits-no-log-event-whe
source: reflection
title: parkForDiscussion emits no log event when rename fails — silent failure with no operator visibility
added_at: "2026-05-21T15:40:29.625Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0228"
---

When `rename(raw.srcPath, destPath)` throws in `parkForDiscussion`, the function sets `renamed = false` and returns without emitting any log event. The file stays in `raw/` (correct), but the engine log shows nothing. On the next run, the engine picks it up silently and tries again. An operator inspecting the log after a suspicious gap would have no record of the failed park attempt. A `log.emit('issue.park_failed', { id: raw.id, error: String(e) })` in the catch branch would give operators the signal they need without changing control flow.
