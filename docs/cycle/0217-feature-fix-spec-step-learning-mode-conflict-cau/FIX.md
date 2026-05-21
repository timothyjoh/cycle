Both tasks fixed. Full test suite passes at 638 tests (637 + 1 new). Coverage: Line 98.5%, Branch 92.5%, Function 93.0% — all gates met, no regression vs baseline.

**Task 1:** SPEC.md rewritten with `## Objective`, `## Acceptance Criteria` (6 checkbox bullets from PLAN.md traceability), and `## Out of Scope`. Verify: `grep -c` returns 1 and 6 respectively.

**Task 2:** Added `"sanitize: mid-document 'SPEC.md written to' line preserved"` test to `tests/engine/sanitize-artifact.test.ts`, confirming the `^` anchor correctly preserves mid-document occurrences of the new pattern.
