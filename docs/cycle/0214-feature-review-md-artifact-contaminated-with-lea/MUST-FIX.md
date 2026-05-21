# Must-Fix Items: Cycle 0214

## Summary
1 critical issue: SPEC.md missing `## Acceptance Criteria` section.

## Tasks

- [x] ### Task 1 (Missing SPEC AC Section): Add ## Acceptance Criteria to SPEC.md
  **Priority:** Critical
  **Files:** `docs/cycle/0214-feature-review-md-artifact-contaminated-with-lea/SPEC.md`
  **Problem:** SPEC.md is a contaminated single-sentence prose artifact with no `## Acceptance Criteria` section. Current content: `"SPEC.md written to ... Single deliverable: add ## File Artifact Mode guardrail to review.md prompt + sync-defaults + test assertions, mirroring the pattern from cycles 0212/0213."` Per the review prompt, a missing AC section is a SPEC defect. PLAN.md acknowledged this and sourced ACs from the upstream issue, which is a valid workaround but does not resolve the SPEC artifact itself.
  **Fix:** Replace the contents of `docs/cycle/0214-feature-review-md-artifact-contaminated-with-lea/SPEC.md` with a proper spec document. At minimum it must include:
  1. A brief `## Overview` or introduction sentence describing the deliverable.
  2. A `## Acceptance Criteria` section with the 5 AC bullets already stated verbatim in `PLAN.md`'s SPEC Acceptance Traceability table:
     - `- [ ] REVIEW.md written by the documentation step contains no leading prose, insight blocks, or markdown fence wrappers`
     - `- [ ] The review verdict line (PASS/FAIL) is present and greppable at the top level of the file (not wrapped in a fence)`
     - `- [ ] No trailing narration lines appear after the review content`
     - `- [ ] Existing REVIEW.md-related tests pass without regression`
     - `- [ ] Fix approach is consistent with refl-0209-spec-md-artifacts-contain-learning-mode — no divergent sanitization patterns between spec and review artifact handling`
  **Verify:** `grep -c "^## Acceptance Criteria$" docs/cycle/0214-feature-review-md-artifact-contaminated-with-lea/SPEC.md` returns `1`; file contains at least one `- [ ]` bullet under that section.
  **Status:** ✅ Fixed
  **What was done:** Replaced the contaminated single-sentence narration in SPEC.md with a proper spec document containing `## Overview` and `## Acceptance Criteria` sections. The 5 AC bullets were sourced verbatim from PLAN.md's SPEC Acceptance Traceability table. Verify check passes (AC header count=1, bullet count=5). Full test suite: 611 passing, 0 failing. Coverage: Line 98.51%, Branch 92.50%, Function 92.95% — all gates pass, no regression.
