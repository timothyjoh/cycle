## Overview

Add `## File Artifact Mode` guardrail section to `src/defaults/prompts/review.md` (and sync to `.cycle/prompts/review.md`) to prevent the review documentation step from producing REVIEW.md artifacts contaminated with learning-mode narration, insight blocks, or markdown fence wrappers. Pattern mirrors the guardrails introduced in cycles 0212 (spec.md) and 0213 (plan.md).

## Acceptance Criteria

- [ ] REVIEW.md written by the documentation step contains no leading prose, insight blocks, or markdown fence wrappers
- [ ] The review verdict line (PASS/FAIL) is present and greppable at the top level of the file (not wrapped in a fence)
- [ ] No trailing narration lines appear after the review content
- [ ] Existing REVIEW.md-related tests pass without regression
- [ ] Fix approach is consistent with refl-0209-spec-md-artifacts-contain-learning-mode — no divergent sanitization patterns between spec and review artifact handling
