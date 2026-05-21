---
id: refl-0212-plan-md-prompt-lacks-file-artifact-mode
title: Add File Artifact Mode guardrail to plan.md prompt
workflow: feature
depends_on: []
triaged_at: "2026-05-21T08:17:44.480Z"
source: triage
---
## Problem

`src/defaults/prompts/plan.md` has no `## File Artifact Mode` guardrail. The plan agent emits `PLAN.md` as a file artifact consumed by downstream build and review agents. Without the guardrail, the prompt permits conversational output — demonstrated by cycle 0212's own `PLAN.md` being flagged in REVIEW.md as a "conversational reply ('Plan written to…', 'Which approach?'), not a structured plan document."

This is the identical contamination class that cycle 0212 fixed in `src/defaults/prompts/spec.md`. Contaminated plans break SPEC→PLAN traceability and produce unnecessary NEEDS-FIX cycles.

## Fix

Add a `## File Artifact Mode` section to `src/defaults/prompts/plan.md` mirroring the language added to spec.md in cycle 0212. The section must explicitly prohibit:

- Conversational framing ("Plan written to…", "Which approach?", "I've created…")
- Insight blocks (★ markers, `─────` dividers)
- Confirmation or summary sentences at document end
- Trailing commentary addressed to the reader

Run `npm run sync-defaults` after editing `src/defaults/prompts/plan.md` to propagate changes to `.cycle/prompts/plan.md`.

## Test

Add test assertions pinned to the exact prohibition language, matching the pattern used in cycle 0212's spec.md test additions. Verify with `npm run test:coverage && npm run check:coverage && npm run check:invariants`.

## Acceptance Criteria

- `src/defaults/prompts/plan.md` contains a `## File Artifact Mode` section
- Section explicitly prohibits conversational framing, insight blocks, and confirmation sentences
- `npm run sync-defaults` propagates the change; `.cycle/prompts/plan.md` matches
- Test assertions verify prohibition language is present
- Full test suite passes with no regressions
- Coverage gates pass (no per-file floor violations)
