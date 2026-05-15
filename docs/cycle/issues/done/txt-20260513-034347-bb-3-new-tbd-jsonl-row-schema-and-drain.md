---
id: txt-20260513-034347-bb-3-new-tbd-jsonl-row-schema-and-drain
source: text
title: "BB-3: New tbd.jsonl row schema and drain semantics. Row fields: id, parent, title, status (pending|in_progress), attempt, depends_on, triaged_at, plus cycle_id when in_progress. Engine drains rows: on cycle.end ok, remove row and move file todo/ -> done/. On cycle.end failed and attempt < max, increment attempt and reset status to pending. On cycle.end failed and attempt >= max_cycle_attempts, remove row and move file to failed/ with failed_at/failed_step/failed_attempts frontmatter; then run propagateBlocked. Engine reads workflow from popped file's frontmatter at cycle.start. Archive existing .cycle/tbd.jsonl to .cycle/tbd.jsonl.bootstrap-archive before adopting new schema. See docs/RFC-001-issue-lifecycle.md sections 6, 12 (BB-3)."
added_at: 2026-05-13T03:43:47.684Z
triage_attempts: 0
---

BB-3: New tbd.jsonl row schema and drain semantics. Row fields: id, parent, title, status (pending|in_progress), attempt, depends_on, triaged_at, plus cycle_id when in_progress. Engine drains rows: on cycle.end ok, remove row and move file todo/ -> done/. On cycle.end failed and attempt < max, increment attempt and reset status to pending. On cycle.end failed and attempt >= max_cycle_attempts, remove row and move file to failed/ with failed_at/failed_step/failed_attempts frontmatter; then run propagateBlocked. Engine reads workflow from popped file's frontmatter at cycle.start. Archive existing .cycle/tbd.jsonl to .cycle/tbd.jsonl.bootstrap-archive before adopting new schema. See docs/RFC-001-issue-lifecycle.md sections 6, 12 (BB-3).
