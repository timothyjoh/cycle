---
id: refl-0191-documentation-prompt-extraction-guidance
source: reflection
title: documentation-prompt extraction-guidance assumes prose REFLECTION.md but reflection output is JSON
added_at: "2026-05-20T02:09:47.801Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0191"
---

The reflection agent emits `{"sharp_edges":[{"title","body","priority_hint"}]}` JSON to stdout. If the engine captures stdout verbatim to REFLECTION.md (same pattern as DOCUMENTATION.md), then REFLECTION.md is raw JSON — not prose with named sections.

The documentation prompt's extraction guidance (lines 38-48) lists three prose categories — "Deferred items", "Known limitations / sharp edges", "Acknowledged trade-offs" — with no indication that the file is JSON or that these map to `sharp_edges[].body`. The JSON schema has only a single `sharp_edges` array; there is no distinct "deferred items" field to match the first bullet.

This mismatch makes the extraction guidance misleading. A documentation agent that takes the prompt at face value may skip REFLECTION.md (can't find the expected prose sections) or parse it incorrectly. The fix is to update the guidance to acknowledge the JSON format: "REFLECTION.md is a JSON object with a `sharp_edges` array; each entry has `title`, `body` (markdown), and `priority_hint`. Map `body` content to the appropriate doc category."
