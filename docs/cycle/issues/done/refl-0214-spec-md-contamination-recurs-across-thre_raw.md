---
id: refl-0214-spec-md-contamination-recurs-across-thre
source: reflection
title: SPEC.md contamination recurs across three consecutive cycles despite cycle 0212 guardrail
added_at: "2026-05-21T09:00:46.167Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0214"
---

Cycles 0213 and 0214 both produced contaminated SPEC.md artifacts (single-sentence meta-narration, no `## Acceptance Criteria` section) despite the `## File Artifact Mode` guardrail being added to `src/defaults/prompts/spec.md` in cycle 0212. Each cycle required a MUST-FIX pass to repair the artifact. The pattern is identical both times: the spec step emits a single narrative sentence like "SPEC.md written to... Single deliverable: ..." instead of structured markdown with Overview and AC sections.

This indicates the guardrail in `spec.md` is not being respected by the spec step agent — likely because learning-mode context (insight blocks, narration framing) overrides or dilutes the file-artifact instruction at invocation time. Three consecutive cycles with the same defect signals a systemic failure, not a one-off.

Suggested directions: (1) Audit whether the spec step's system prompt / invocation context includes learning-mode instructions that compete with the File Artifact Mode guardrail; (2) Add an engine-level post-condition check after the spec step that verifies `## Acceptance Criteria` is present before proceeding to plan — fail-fast rather than silently inheriting a broken spec into downstream steps.
