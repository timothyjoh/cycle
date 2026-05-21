# Must-Fix Items: Cycle 0217

## Summary
2 issues found: 1 critical (SPEC.md missing `## Acceptance Criteria`), 1 minor (no mid-document negative test for new sanitizer patterns).

## Tasks

- [x] ### Task 1: Reconstruct proper SPEC.md for cycle 0217
  **Priority:** Critical
  **Files:** `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md`
  **Problem:** The SPEC.md artifact at that path contains only contamination output — the exact bug this cycle fixes. It has no `## Objective`, no `## Acceptance Criteria`, no structured sections. Current content is:
  ```
  SPEC.md written to `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md`.

  Scope: extend `sanitizeArtifactStdout`…
  ```
  A missing `## Acceptance Criteria` section is a NEEDS-FIX trigger per review policy.
  **Fix:** Rewrite `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md` with proper structure. Use the 6 AC bullets reconstructed in `PLAN.md`'s `## SPEC Acceptance Traceability` table as the source of truth. Minimum required sections: `## Objective`, `## Acceptance Criteria` (with the 6 checkbox bullets from PLAN.md verbatim), `## Out of Scope`. Example AC bullets from PLAN.md traceability:
  - `- [ ] sanitizeArtifactStdout strips SPEC.md written to \`path\`. leading confirmation line`
  - `- [ ] sanitizeArtifactStdout strips Single deliverable: leading line`
  - `- [ ] New test cases in sanitize-artifact.test.ts cover both patterns`
  - `- [ ] src/defaults/prompts/spec.md contains the exact string SPEC.md written to as a concrete negative example`
  - `- [ ] spec-prompt-ac.test.ts has an assertion verifying confirmation sentences phrase is present`
  - `- [ ] All tests pass with global coverage gates met (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)`
  **Verify:** `grep -c "## Acceptance Criteria" docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md` returns `1`; `grep -c "^\- \[ \]" docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md` returns `6`.
  **Status:** ✅ Fixed
  **What was done:** Rewrote SPEC.md with `## Objective`, `## Acceptance Criteria` (6 checkbox bullets from PLAN.md traceability table verbatim), and `## Out of Scope` sections.

- [x] ### Task 2: Add mid-document negative test for new sanitizer patterns
  **Priority:** Minor
  **Files:** `tests/engine/sanitize-artifact.test.ts`
  **Problem:** The 3 new tests (lines 64–84) verify that `SPEC.md written to` and `Single deliverable:` are stripped when they appear at the start of output. No test verifies that these patterns are NOT stripped when they appear mid-document (after real content). The `^` anchor prevents mid-document stripping, but the existing "mid-document 'Now ' line preserved" test (line 52) covers only the original patterns. The new patterns lack an equivalent negative test.
  **Fix:** Append one test to `tests/engine/sanitize-artifact.test.ts` after the last existing test:
  ```typescript
  test("sanitize: mid-document 'SPEC.md written to' line preserved", () => {
    const input = "# Real Content\n\nSPEC.md written to `some/path`.\n";
    assert.equal(sanitizeArtifactStdout(input), "# Real Content\n\nSPEC.md written to `some/path`.\n");
  });
  ```
  **Verify:** `npm test` passes with 638 tests (637 + 1); the new test name appears in passing output.
  **Status:** ✅ Fixed
  **What was done:** Appended `"sanitize: mid-document 'SPEC.md written to' line preserved"` test to `tests/engine/sanitize-artifact.test.ts`. Suite passes at 638 tests.
