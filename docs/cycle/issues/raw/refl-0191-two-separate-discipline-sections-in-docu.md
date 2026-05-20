---
id: refl-0191-two-separate-discipline-sections-in-docu
source: reflection
title: two separate Discipline sections in documentation prompt risk partial application
added_at: "2026-05-20T02:09:47.801Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0191"
---

After this cycle's edits, `src/defaults/prompts/documentation.md` has two discipline blocks: an inline "Discipline:" paragraph at line 50 (inside `## What to edit`, covering edit hygiene) and a `### Discipline` subsection at line 75 (under `## Output contract`, covering stdout format). An LLM agent reading the prompt may apply one but not the other, or treat them as a single merged constraint and mis-scope the rules.

Fix: rename the first block to `### Constraints` or `### Edit rules` to give each a distinct identity, or consolidate into a single top-level `## Discipline` section with two subsections.
