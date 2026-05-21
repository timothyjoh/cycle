---
id: refl-0214-file-artifact-mode-guardrail-absent-from
source: reflection
title: File Artifact Mode guardrail absent from build, research, fix, and documentation prompts
added_at: "2026-05-21T09:00:46.167Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0214"
---

The guardrail pattern has now been added to `spec.md` (cycle 0212), `plan.md` (cycle 0213), and `review.md` (cycle 0214). However, `src/defaults/prompts/build.md`, `research.md`, `fix.md`, and `documentation.md` all produce agent-written artifacts (BUILD.md, RESEARCH.md, FIX.md) without any File Artifact Mode section. These prompts are equally susceptible to learning-mode contamination.

This cycle's own `FIX.md` opens with `"**Fix complete.**"` — borderline confirmation language. The contamination vector is the same across all artifact-producing steps. Completing the guardrail series across all remaining prompts closes the exposure and prevents future MUST-FIX cycles for each one individually.
