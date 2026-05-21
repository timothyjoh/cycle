# Must-Fix Items: Cycle 0222

## Summary
1 minor issue found in review.

## Tasks

- [x] ### Task 1: Remove PLAN.md narration preamble
  **Status:** ✅ Fixed
  **What was done:** Deleted lines 1–11 from PLAN.md (agent narration before heading). `head -1 PLAN.md` now returns `# Implementation Plan: Cycle 0222`.
  **Priority:** Minor
  **Files:** `docs/cycle/0222-feature-implement-or-document-generic-appendsyst/PLAN.md`
  **Problem:** Lines 1–11 of PLAN.md contain agent narration before the document heading — "Good - codex and opencode are confirmed. Now I have all findings to write the plan." followed by a "Findings resolved:" bullet list and "No agent gains flag forwarding → step.warning test stays unchanged. Now writing the plan." The actual plan document begins at line 13 with `# Implementation Plan: Cycle 0222`. This narration is artifact contamination: the plan agent wrote its reasoning into the artifact file instead of emitting only the document content.
  **Fix:** Delete lines 1–11 (everything before `# Implementation Plan: Cycle 0222`) from PLAN.md, leaving the heading as the first line of the file.
  **Verify:** `head -1 docs/cycle/0222-feature-implement-or-document-generic-appendsyst/PLAN.md` returns `# Implementation Plan: Cycle 0222`.
