---
id: refl-0206-stripfences-regex-misses-non-json-langua
title: Widen stripFences regex to match any language-tagged fence opener
workflow: feature
depends_on: []
triaged_at: "2026-05-21T06:08:12.172Z"
source: triage
---
## Problem

The `stripFences` helper in `src/engine/log-fmt.ts` uses `/^```(?:json)?\r?\n/` to strip leading code fences before `JSON.parse`. This matches only ` ```json ` and bare ` ``` `. LLMs routinely emit other tags that bypass the strip:

- ` ```javascript `
- ` ```text `
- ` ```JSON ` (case mismatch — regex is case-sensitive)
- ` ```jsonc `

These variants pass through unstripped, causing `JSON.parse` to fail even with the fence-strip fallback active. The partial fix leaves ~24% of observed fence variants unhandled.

## Fix

Widen the opening fence pattern to match any optional word tag:

```
/^```(?:\w+)?\r?\n/
```

The `(?:\w+)?` form is preferred over adding `i` flag only to `(?:json)?` — it future-proofs against arbitrary language tags LLMs may emit. The closing fence strip (` /```\s*$/ `) requires no change.

## Acceptance Criteria

- `stripFences` strips ` ```javascript\n{...}\n``` ` → `{...}\n`
- `stripFences` strips ` ```text\n{...}\n``` ` → `{...}\n`
- `stripFences` strips ` ```JSON\n{...}\n``` ` → `{...}\n` (case-insensitive)
- `stripFences` strips ` ```jsonc\n{...}\n``` ` → `{...}\n`
- Existing tests for ` ```json ` and bare ` ``` ` continue to pass unchanged
- New unit test cases added for each variant above
- Coverage floor for `src/engine/log-fmt.ts` remains at 100%

## Files

- `src/engine/log-fmt.ts` — update opening fence regex in `stripFences`
- Test file covering `src/engine/log-fmt.ts` — add cases for `text`, `javascript`, `JSON`, `jsonc` variants
