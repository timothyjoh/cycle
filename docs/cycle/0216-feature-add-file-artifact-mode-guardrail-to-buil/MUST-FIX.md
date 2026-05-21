# Must-Fix Items: Cycle 0216

## Summary
1 critical issue found in review: SPEC.md artifact is contaminated with a confirmation sentence and missing the required `## Acceptance Criteria` section.

## Tasks

- [x] ### Task 1: Restore SPEC.md with proper structure and Acceptance Criteria section
  **Priority:** Critical
  **Files:** `docs/cycle/0216-feature-add-file-artifact-mode-guardrail-to-buil/SPEC.md`
  **Problem:** SPEC.md contains only the single line `SPEC written to \`docs/cycle/0216-feature-add-file-artifact-mode-guardrail-to-buil/SPEC.md\`. Adds guardrail to 4 prompts, syncs defaults, adds test coverage mirroring the review-prompt pattern.` — a confirmation sentence from the spec-step agent leaking into the artifact. This is the same contamination pattern seen in cycles 0212–0215. No `## Acceptance Criteria` section exists.
  **Fix:**
  1. Open `docs/cycle/0216-feature-add-file-artifact-mode-guardrail-to-buil/SPEC.md`.
  2. Replace the entire file content with a proper spec artifact. The spec title is "Add File Artifact Mode guardrail to build, research, fix, and documentation prompts". Source the AC bullets from the issue file at `docs/cycle/issues/done/refl-0214-file-artifact-mode-guardrail-absent-from_raw.md` `## Acceptance Criteria` section (8 bullets).
  3. The file must include at minimum: a `## Problem` section, an `## Implementation` section, and a `## Acceptance Criteria` section with all 8 AC bullets verbatim from the issue file.
  4. Do not include any confirmation language ("SPEC written to…", "Here is the spec", etc.).
  **Verify:** `grep -c "^## Acceptance Criteria$" docs/cycle/0216-feature-add-file-artifact-mode-guardrail-to-buil/SPEC.md` returns `1`; `grep -c "^- " docs/cycle/0216-feature-add-file-artifact-mode-guardrail-to-buil/SPEC.md` returns ≥ 8.
  **Status:** ✅ Fixed
  **What was done:** Replaced single-line confirmation sentence with proper SPEC.md containing `## Problem`, `## Implementation`, and `## Acceptance Criteria` sections. All 8 AC bullets sourced verbatim from the issue file. Verify checks pass: `## Acceptance Criteria` count = 1, bullet line count = 8.
