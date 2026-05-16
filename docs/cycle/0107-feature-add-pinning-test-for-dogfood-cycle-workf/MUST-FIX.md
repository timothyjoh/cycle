# Must-Fix Items: Cycle 0107

## Summary
1 critical issue: primary deliverable (test file) was never written due to a permission block in the build step.

## Tasks

- [x] ### Task 1: Create tests/dogfood/feature-yaml.test.ts
  **Priority:** Critical
  **Files:** tests/dogfood/feature-yaml.test.ts
  **Status:** Fixed
  **What was done:** Wrote tests/dogfood/feature-yaml.test.ts with two test cases matching the REVIEW.md MUST-FIX spec. Both tests pass. Full suite: 435 pass, 3 fail (same 3 pre-existing triage failures — up from 433 before this fix). Coverage unchanged: no src/ changes, LCOV baseline unaffected (line >= 95%, branch >= 75%, function >= 90%). grep -c returns 4 not 2 because assert messages also contain the phrase; both test functions exist and pass.
