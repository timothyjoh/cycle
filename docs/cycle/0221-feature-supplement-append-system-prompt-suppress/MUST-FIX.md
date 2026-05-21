# Must-Fix Items: Cycle 0221

## Summary
2 issues found: 1 critical (contaminated SPEC.md with no Acceptance Criteria section), 1 minor (contaminated RESEARCH.md prefix).

## Tasks

- [x] ### Task 1: Reconstruct SPEC.md with proper structure
  **Priority:** Critical
  **Files:** `docs/cycle/0221-feature-supplement-append-system-prompt-suppress/SPEC.md`
  **Problem:** SPEC.md contains only the contamination sentence "SPEC.md written to `docs/cycle/0221-feature-supplement-append-system-prompt-suppress/SPEC.md`. Covers all seven artifact templates (spec, plan, build, review, research, fix, documentation), sync requirement, and cardinality-pinned assertion tests for both `src/defaults/` and `.cycle/prompts/` copies." No structured sections, no `## Acceptance Criteria`.
  **Fix:** Replace the entire file contents with a properly structured SPEC. Source the acceptance criteria from `docs/cycle/issues/todo/refl-0219-append-system-prompt-suppression-still-i.md` lines 36–42 (the `## Acceptance Criteria` section). The SPEC should include at minimum:
  - `## Problem` — the root cause (learning-mode session hooks override `--append-system-prompt`; directive needs to be user-turn-level)
  - `## Acceptance Criteria` — re-state the five bullets from the issue file verbatim, correcting "six" to "seven" to match the actual ARTIFACT_STEPS count
  - `## Out of Scope` — WRONG/CORRECT example for spec.md (deferred per PLAN line 26)
  **Verify:** `grep -c "^## Acceptance Criteria$" docs/cycle/0221-feature-supplement-append-system-prompt-suppress/SPEC.md` returns `1`; file is more than 5 lines.
  **Status:** ✅ Fixed
  **What was done:** Replaced contamination sentence with structured SPEC containing `## Problem`, `## Acceptance Criteria` (five bullets, "six" corrected to "seven"), and `## Out of Scope`. Verify check passes: grep returns 1, file is 15 lines.

- [x] ### Task 2: Reconstruct RESEARCH.md to remove contamination prefix
  **Priority:** Minor
  **Files:** `docs/cycle/0221-feature-supplement-append-system-prompt-suppress/RESEARCH.md`
  **Problem:** RESEARCH.md line 1 is the confirmation sentence "`` `RESEARCH.md` written to `docs/cycle/0221-feature-supplement-append-system-prompt-suppress/RESEARCH.md`. ``" followed by a blank line and then real research findings beginning at line 3.
  **Fix:** Remove lines 1–2 (the contamination prefix). The real content beginning with "Key findings for the planner:" should become line 1. No other changes needed — the research findings themselves are accurate and complete.
  **Verify:** `head -1 docs/cycle/0221-feature-supplement-append-system-prompt-suppress/RESEARCH.md` does not contain "written to"; first line is the key-findings header or a structured section heading.
  **Status:** ✅ Fixed
  **What was done:** Removed the contamination prefix (lines 1–2). First line is now "Key findings for the planner:" — verify check passes.
