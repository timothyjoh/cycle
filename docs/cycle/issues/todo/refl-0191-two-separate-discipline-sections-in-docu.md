---
id: refl-0191-two-separate-discipline-sections-in-docu
title: Rename duplicate Discipline heading in documentation prompt to eliminate ambiguity
workflow: feature
depends_on: [refl-0191-documentation-prompt-extraction-guidance]
triaged_at: "2026-05-20T02:17:00.614Z"
source: triage
---
## Problem

`src/defaults/prompts/documentation.md` now has two blocks named "Discipline" after cycle 0191 edits:

- **~Line 50** (inside `## What to edit`): inline `Discipline:` paragraph covering edit hygiene rules (what files to touch, what not to overwrite)
- **~Line 75** (inside `## Output contract`): `### Discipline` subsection covering stdout format constraints (emit only valid JSON, no markdown fences)

An LLM agent reading the prompt may apply one block but skip the other, or merge them and mis-scope the rules (e.g. treating stdout-format constraints as edit-hygiene rules or vice versa).

## Fix

Choose one of:

**Option A — Rename in place (minimal change):**
Rename the `## What to edit` inline block from `Discipline:` to `### Edit constraints` or `### Edit rules`, leaving the `## Output contract → ### Discipline` subsection unchanged.

**Option B — Consolidate (cleaner structure):**
Lift both into a single top-level `## Discipline` section with two clearly labelled subsections:
- `### Edit rules` — edit hygiene (what to touch, what to leave alone)
- `### Output format` — stdout contract (JSON only, no fences)

Option A is the lower-risk change; prefer it unless the surrounding structure already invites consolidation.

## Acceptance criteria

- `src/defaults/prompts/documentation.md` has no two headings with the same text "Discipline"
- Each discipline-style block has a unique, scope-specific heading that signals its domain (edit hygiene vs. output format)
- `npm run sync-defaults` run after editing to propagate changes to `.cycle/prompts/documentation.md`
- `npm test` passes with no regressions
