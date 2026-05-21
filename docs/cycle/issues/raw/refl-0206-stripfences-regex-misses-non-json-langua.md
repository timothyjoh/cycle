---
id: refl-0206-stripfences-regex-misses-non-json-langua
source: reflection
title: stripFences regex misses non-json language-tagged fences
added_at: "2026-05-21T06:04:29.605Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0206"
---

The `stripFences` helper in `src/engine/log-fmt.ts` only matches ` ```json ` or bare ` ``` ` openers via `/^```(?:json)?\r?\n/`. LLMs commonly emit other tags: ` ```javascript `, ` ```text `, ` ```JSON ` (case-sensitive mismatch), ` ```jsonc `. These pass through unstripped, causing `JSON.parse` to fail even with the fence-strip fallback in place.

The fix is to widen the match group to any optional word tag: `/^```(?:\w+)?\r?\n/` — or at minimum add case-insensitive matching for `JSON` variants. The test suite should add cases for ` ```text `, ` ```javascript `, and ` ```JSON `.
