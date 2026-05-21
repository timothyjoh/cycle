---
id: refl-0221-spec-md-wrong-correct-negative-example-m
source: reflection
title: spec.md WRONG/CORRECT negative example missing — deferred at least three cycles
added_at: "2026-05-21T11:51:17.645Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0221"
---

The `src/defaults/prompts/spec.md` template still lacks a WRONG/CORRECT negative example in its `## File Artifact Mode` section. This was flagged as out of scope in cycle 0221's SPEC.md and has been deferred across cycles 0218, 0219, and 0221. All other six artifact templates have the negative example pattern.

Without a negative example, the spec step has weaker signal about what contaminated output looks like. The gap is now three cycles old and should be addressed as a standalone issue.
