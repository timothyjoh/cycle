---
id: refl-0226-priority-hint-only-normalization-path-ha
source: reflection
title: priority_hint-only normalization path has no test coverage
added_at: "2026-05-21T13:51:32.736Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0226"
---

The normalization pre-pass in `readQueue` uses `o.priority ?? o.priority_hint` before calling `normalizePriority`. This correctly handles queue rows that have `priority_hint` but no `priority` field (old format). However, the REVIEW confirmed no test covers this branch — only the case where both fields are present is tested (`tests/engine/queue.test.ts:351`).

If the normalization logic changes in a future cycle, a regression on the `priority_hint`-only path would not be caught by the test suite.

Suggested direction: Add a test in `tests/engine/queue.test.ts` that writes a queue row with `priority_hint: 'high'` and no `priority` field, then calls `readQueue` and asserts the returned row has `priority: 'high'`.
