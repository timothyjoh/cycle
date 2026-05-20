---
id: refl-0191-documentation-prompt-extraction-guidance
title: Fix documentation prompt extraction guidance to describe REFLECTION.md as JSON not prose
workflow: feature
depends_on: []
triaged_at: "2026-05-20T02:14:01.164Z"
source: triage
---
## Problem

The documentation prompt's extraction guidance (approximately lines 38-48) describes three prose categories to extract from `REFLECTION.md`:

- "Deferred items"
- "Known limitations / sharp edges"
- "Acknowledged trade-offs"

However, `REFLECTION.md` is not prose. The reflection agent emits a JSON object to stdout; the engine captures stdout verbatim and writes it as `REFLECTION.md`. The resulting file looks like:

```json
{"sharp_edges":[{"title":"...","body":"...","priority_hint":8}]}
```

The schema has only a single `sharp_edges` array — there is no distinct "deferred items" field or any named prose section. The current extraction guidance is misleading: a documentation agent following it literally may skip `REFLECTION.md` (can't find expected sections) or fail to parse it correctly.

## Fix

Update the extraction guidance section in the documentation prompt to:

1. State that `REFLECTION.md` is a JSON object, not prose.
2. Document the schema: `{ "sharp_edges": [{ "title": string, "body": string, "priority_hint": number }] }`.
3. Explain field semantics: `body` contains the substantive markdown content; `title` is a short label; `priority_hint` signals relative importance.
4. Explain how to map `body` content to documentation categories by semantic content, not by named sections.
5. Remove or correct the prose-category bullets that imply named sections exist in the file.

## Files to locate

The documentation prompt is likely under `src/defaults/prompts/` (check for a file named `documentation.md` or similar). After editing `src/defaults/`, run `npm run sync-defaults` to propagate the change to `.cycle/`.

## Acceptance criteria

- [ ] Documentation prompt no longer describes `REFLECTION.md` as prose with named sections.
- [ ] Prompt states `REFLECTION.md` is a JSON object with a `sharp_edges` array.
- [ ] Prompt documents each entry's fields: `title`, `body` (markdown), `priority_hint`.
- [ ] Prompt explains how to categorize `body` content by semantic meaning.
- [ ] `npm run sync-defaults` run; `.cycle/` reflects the updated prompt.
- [ ] `npm test` passes with no regressions.
- [ ] `npm run typecheck` passes.
