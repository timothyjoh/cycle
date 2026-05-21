---
id: refl-0209-spec-md-artifacts-contain-learning-mode
title: Fix spec step prompt to prevent conversational narration in SPEC.md artifacts
workflow: feature
depends_on: []
triaged_at: "2026-05-21T07:18:49.648Z"
source: triage
---
## Problem

The spec step agent writes its conversational output-style framing directly into `SPEC.md` artifacts instead of producing structured spec content. Observed contamination forms:

- `★ Insight ──` blocks (learning-mode UI chrome)
- `"Spec written to…"` confirmation messages
- Single informal sentences standing in for structured sections

## Evidence

- `docs/cycle/0209-feature-fix-trimtolastbalancedclose-to-retry-fro/SPEC.md` contains only an insight block, a confirmation message, and one informal sentence — no structured spec.
- Same contamination pattern identified in at least 7 earlier cycles: 0084, 0085, 0089, 0094, 0097, 0192, 0195.

## Root Cause

The spec step prompt does not tell the agent that `SPEC.md` is a **file artifact**. The agent treats its task as a conversation turn and emits its normal output-style framing into the file. The learning-mode hook adds `★ Insight` blocks around every substantive response; without an explicit artifact-mode instruction, those blocks land in the file.

## Impact

Build and review agents read `SPEC.md` as their source of truth for acceptance criteria. A polluted file forces them to infer requirements from conversational prose, introducing ambiguity and breaking PLAN→SPEC traceability checks documented in `docs/ENGINE.md`.

## Fix

Update the spec step prompt (wherever it is constructed in `src/engine/` or `src/defaults/`) to:

1. Explicitly state that the agent is writing a **file artifact** — not responding in a conversation.
2. Prohibit all conversational framing: no insight blocks, no `★` markers, no "Spec written to…" or similar confirmation sentences.
3. Require structured output: at minimum `## Problem`, `## Acceptance Criteria`, and `## Constraints` sections.

Note: the missing `## Acceptance Criteria` requirement is tracked separately in `refl-0205-spec-md-prompt-does-not-require-a-struct`. Both fixes touch the same prompt; coordinate to avoid conflicts or land them in sequence.

## Out of Scope

Do not retroactively rewrite the 8 contaminated SPEC.md files (0084, 0085, 0089, 0094, 0097, 0192, 0195, 0209). They are historical artifacts; fixing the prompt prevents future contamination.

## Acceptance Criteria

- [ ] Spec step prompt includes an explicit instruction that `SPEC.md` is a file artifact with no conversational framing.
- [ ] Prompt explicitly prohibits insight/`★` blocks and confirmation messages in the written output.
- [ ] After the fix, a newly generated `SPEC.md` contains only structured spec sections — no insight blocks, no confirmation text.
- [ ] Existing tests pass; add a test or documented manual check verifying prompt content if feasible.
