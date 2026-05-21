---
id: refl-0216-review-md-artifact-contaminated-despite
source: reflection
title: REVIEW.md artifact contaminated despite cycle 0214 guardrail — root cause is invocation context not prompt text
added_at: "2026-05-21T09:38:50.485Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0216"
---

Cycle 0216's `REVIEW.md` opens with `"REVIEW.md and MUST-FIX.md written."` — a confirmation sentence — despite `src/defaults/prompts/review.md` having a `## File Artifact Mode` guardrail since cycle 0214 (two cycles prior). This mirrors the recurring SPEC.md contamination pattern.

The existing todo `refl-0214-spec-md-contamination-recurs-across-thre-fix-spec-step-learning-mode-conflict` targets the spec step specifically, attributing contamination to learning-mode context competing with the guardrail at invocation time. Cycle 0216 adds direct evidence that the review step shares the same root cause: prompt text alone is insufficient to prevent contamination when the agent session carries learning-mode framing.

Broaden the investigation to cover all artifact-producing steps (spec, plan, review, build, research, fix, documentation). The fix likely needs to act at the invocation layer — either stripping learning-mode system context before artifact-writing steps or strengthening guardrails with negative output examples that explicitly model the contamination pattern.
