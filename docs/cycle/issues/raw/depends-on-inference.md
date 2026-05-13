---
id: depends-on-inference
source: text
title: "Improve triage's depends_on inference quality"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 6
---

## Why

First pass of triage (BB-4) likely only honors explicit `depends_on:` hints from the raw issue's frontmatter. But when decomposing a single raw into N children, the triage agent has the knowledge to infer dependencies between siblings (e.g., "add 2FA flow depends on fix login cookie").

## Acceptance
- Triage prompt (triage.md) explicitly instructs: when decomposing, identify dependencies between children; emit `depends_on:` arrays in the output children[]
- Add an example in the prompt few-shot showing dependency inference
- Tests cover the case: a raw issue that obviously needs sequential children should produce children with `depends_on` chained properly
- Engine validates: a child's `depends_on` must reference either another child in the same triage output or an existing todo (not a non-existent id)
