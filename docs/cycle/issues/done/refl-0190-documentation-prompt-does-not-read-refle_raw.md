---
id: refl-0190-documentation-prompt-does-not-read-refle
source: reflection
title: documentation prompt does not read REFLECTION.md — reorder delivers no functional benefit yet
added_at: "2026-05-20T01:56:33.204Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0190"
---

The entire motivation for cycle 0190 was: "reflection insights (sharp edges, known limitations, deferred items) are available to the documentation agent when it writes release notes and doc updates." The reorder was implemented correctly — `reflection` now runs at step 7, `documentation` at step 8. But `.cycle/prompts/documentation.md` (and its canonical source `src/defaults/prompts/documentation.md`) lists only `SPEC.md`, `BUILD.md`, `REVIEW.md`, and `FIX.md` as inputs; `REFLECTION.md` is not listed.

The reorder created the precondition (reflection artifact exists when documentation runs) but the documentation agent has no awareness of that output. Without reading `REFLECTION.md`, the step reorder is inert — documentation generates the same output it would have before. The follow-up task is to add `REFLECTION.md` to the `## Inputs to read` section of `prompts/documentation.md`, with guidance on what to extract from it (deferred items that the docs should mention, known limitations to surface, sharp edges that affect documented behavior).
