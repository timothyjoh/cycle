---
id: refl-0209-spec-md-artifacts-contain-learning-mode
source: reflection
title: SPEC.md artifacts contain learning-mode narration instead of spec content
added_at: "2026-05-21T07:13:09.555Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0209"
---

The SPEC.md for cycle 0209 (`docs/cycle/0209-feature-fix-trimtolastbalancedclose-to-retry-fro/SPEC.md`) contains only conversational narration: an `★ Insight ──` block, "Spec written to…" confirmation text, and a single informal sentence. The same contamination pattern appears in at least 7 earlier SPEC.md files (0084, 0085, 0089, 0094, 0097, 0192, 0195). The spec agent is writing its conversational output-style framing directly into the artifact instead of a structured spec document.

Build and review agents downstream read SPEC.md as their source of truth for acceptance criteria. When the file is polluted narration rather than a spec, they must infer requirements from prose — introducing ambiguity and making PLAN-to-SPEC traceability checks unreliable. The ENGINE.md already documents that the spec prompt lacks a mandatory `## Acceptance Criteria` section; the narration contamination is a separate, compounding problem. Fix direction: the spec step prompt should instruct the agent that SPEC.md is a file artifact and that no conversational framing, insight blocks, or confirmation messages should appear in it.
