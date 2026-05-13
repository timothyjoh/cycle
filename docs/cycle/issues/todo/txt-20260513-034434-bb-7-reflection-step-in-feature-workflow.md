---
id: txt-20260513-034434-bb-7-reflection-step-in-feature-workflow
source: text
title: "BB-7: Reflection step in feature workflow. Add reflection as the final step in the feature workflow in workflows.yml, agent: claudecode, prompt: prompts/reflection.md. New src/defaults/prompts/reflection.md: reads cycle artifacts (SPEC.md, RESEARCH.md, PLAN.md, BUILD.md, REVIEW.md, MUST-FIX.md, FIX.md) and git diff, surfaces sharp edges as a JSON list of {title, body, priority_hint}. Engine handles reflection output: for each sharp_edges[] entry, write a new raw/ file with source: reflection frontmatter and the body; these get triaged on the next pass. Empty array = no follow-ups. See docs/RFC-001-issue-lifecycle.md sections 9, 12 (BB-7)."
added_at: 2026-05-13T03:44:34.839Z
triage_attempts: 0
---

BB-7: Reflection step in feature workflow. Add reflection as the final step in the feature workflow in workflows.yml, agent: claudecode, prompt: prompts/reflection.md. New src/defaults/prompts/reflection.md: reads cycle artifacts (SPEC.md, RESEARCH.md, PLAN.md, BUILD.md, REVIEW.md, MUST-FIX.md, FIX.md) and git diff, surfaces sharp edges as a JSON list of {title, body, priority_hint}. Engine handles reflection output: for each sharp_edges[] entry, write a new raw/ file with source: reflection frontmatter and the body; these get triaged on the next pass. Empty array = no follow-ups. See docs/RFC-001-issue-lifecycle.md sections 9, 12 (BB-7).
