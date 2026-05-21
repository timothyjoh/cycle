# Review: Cycle 0217

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md

NEEDS-FIX triggers: missing `## Acceptance Criteria` section in SPEC.md (the artifact is contaminated by the exact bug this cycle fixes).

## Code Quality Review

### Summary
Implementation is correct and minimal. The 1-line regex change in `sanitize-artifact.ts` is well-structured, the spec.md negative example is concrete and actionable, sync ran, and all coverage gates pass. The only quality gap is the SPEC.md artifact itself — contaminated by the bug being fixed, leaving no structured AC section in the cycle record.

### Findings
1. **SPEC.md contamination**: `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md` contains only the `SPEC.md written to …` preamble — no `## Objective`, no `## Acceptance Criteria`, no structured Markdown sections. This is the meta-irony of the cycle: the artifact is the victim of the bug being fixed. PLAN.md documents this and reconstructs AC bullets from session history. The fix step must rewrite the SPEC.md artifact with proper structure. — `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md:1-3`

2. **Hardcoded cycle path in spec.md negative example**: The negative example at `src/defaults/prompts/spec.md:129` contains `0217-feature-fix-spec-step-learning-mode-conflict-cau` — a cycle-specific path that will be outdated within one cycle. The intent (give the model an exact pattern it has seen) is sound per PLAN.md rationale, and the pattern itself remains pedagogically correct. Minor concern: as the codebase evolves the path diverges from reality, but it doesn't affect correctness. Observation only, no fix required.

3. **Regex correctness**: `/^(?:(?:Now|Next|Here is|Output)\b|[A-Za-z0-9_.]+\.md written to|Single deliverable:)[^\n]*(?:\n|$)/` — the `^` anchor is outside the non-capturing group, so it applies to the full alternation. `\b` is scoped only to the word-boundary-sensitive prefixes. The new alternations (`[A-Za-z0-9_.]+\.md written to` and `Single deliverable:`) are anchored at line start via `^` and cannot match mid-document. Correct. — `src/engine/sanitize-artifact.ts:1`

### Spec Compliance Checklist
- [x] `sanitizeArtifactStdout` strips `SPEC.md written to \`path\`.` leading confirmation line
- [x] `sanitizeArtifactStdout` strips `Single deliverable:` leading line
- [x] New test cases in `sanitize-artifact.test.ts` cover both patterns (3 tests)
- [x] `src/defaults/prompts/spec.md` contains the exact string `SPEC.md written to` as negative example
- [x] `spec-prompt-ac.test.ts` asserts `confirmation sentences` phrase is present
- [x] All tests pass with global coverage gates met (637 tests, Line 98.51%, Branch 92.50%, Function 92.95%)
- [ ] SPEC.md has `## Acceptance Criteria` section — MISSING (artifact is contaminated)

## Adversarial Test Review

### Summary
Test quality is adequate. The 3 new sanitizer tests directly test the exact observed contamination patterns with string literals and strong equality assertions. The 2 new prompt-ac tests assert phrase presence with clear failure messages. One gap: no negative mid-document test for the new patterns.

### Findings
1. **Missing mid-document negative test**: No test verifies that `SPEC.md written to` or `Single deliverable:` appearing mid-document (after real content) is NOT stripped. The existing "mid-document 'Now ' line preserved" test at line 52 covers the original patterns but not the new ones. The `^` anchor makes this correct by construction, but the property is untested for the new alternations. — `tests/engine/sanitize-artifact.test.ts:52`

2. **Assertion quality**: All 3 new sanitizer tests use `assert.equal` with exact string literals — strong. Both new spec-prompt-ac tests use `assert.ok(body.includes(...))` with descriptive failure messages — appropriate for presence checks.

3. **Happy-path only for `Single deliverable:`**: The test checks `"Single deliverable: SPEC.md\n\n# SPEC\nbody.\n"` but not a `Single deliverable:` line appearing WITHOUT a preceding `SPEC.md written to` line. This is tested independently (Task 4, second test), which is correct.

4. **Combined sequence test**: The combined test (`"SPEC.md written to … + Single deliverable: …"`) correctly validates the while-loop strips both back-to-back with intervening blank lines. — `tests/engine/sanitize-artifact.test.ts:75-84`

5. **No false-positive test**: No test verifies that a legitimate first line like `# README.md written for` is NOT stripped. However, the `[A-Za-z0-9_.]+\.md written to` pattern requires the exact string `written to` (no `for`), so false positives are structurally prevented. The existing "non-narration prefixes preserved" test pattern provides indirect coverage. Minor gap, not blocking.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 98.51% / 92.50% / 92.95%
- Regressions vs base (per-file): none — all per-file floors pass; `src/engine/sanitize-artifact.ts` at 100%/100%/100%
- New code without tests: none — every new regex branch is exercised by the 3 new unit tests
- Specific scenarios missing tests: mid-document `SPEC.md written to` not stripped (see Task 2 in MUST-FIX.md)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| strips leading narration and confirmation lines matching `^(?:(?:Now\|Next\|Here is\|Output)\b\|[A-Za-z0-9_.]+\.md written to\|Single deliverable:)…` | `docs/ENGINE.md:86` | `src/engine/sanitize-artifact.ts:1` | OK |
| Cycle 0217 adds engine-level sanitization to strip `SPEC.md written to \`path\`.` confirmation lines | `docs/ENGINE.md:136` | `src/engine/sanitize-artifact.ts:1` | OK |
| strips `Single deliverable:` confirmation lines at the artifact-write seam | `docs/ENGINE.md:136` | `src/engine/sanitize-artifact.ts:1` | OK |
| adds a concrete negative example to `spec.md`'s `## File Artifact Mode` guardrail | `docs/ENGINE.md:136` | `src/defaults/prompts/spec.md:126-133` | OK |
| model can still produce structurally incomplete artifacts (no `## Acceptance Criteria`, no `## Objective`) that pass the `SPEC_MIN_BYTES` gate | `docs/ENGINE.md:136` | `src/engine/run-cycle.ts` (`SPEC_MIN_BYTES = 200` size-only gate, no structural check) | OK |
