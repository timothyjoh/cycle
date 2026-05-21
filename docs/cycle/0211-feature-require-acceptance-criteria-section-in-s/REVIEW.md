All checks complete. Writing REVIEW.md to stdout now.

`★ Insight ─────────────────────────────────────`
Prompt-content tests in this codebase follow a strict "pin the content, not the logic" pattern — `body.includes(...)` over real files rather than mock stubs. Each new section added to a prompt gets its own test file, which ensures the divergence-guard (byte-equality) fails if sync is ever skipped.
`─────────────────────────────────────────────────`

```markdown
# Review: Cycle 0211

## Overall Verdict
PASS — no fixes needed

NEEDS-FIX triggers: code-quality findings, missing tests, coverage
regressions, missing SPEC requirements, any unbacked doc-vs-code
claim from Pass 3, a missing or empty `## Acceptance Criteria` section
in SPEC.md, OR a missing or incomplete SPEC→PLAN traceability
section in PLAN.md.

## Code Quality Review

### Summary
Implementation is surgical and correct. Both prompt files received
exactly the insertions PLAN.md specified. Sync propagated both changes
byte-identically to `.cycle/prompts/`. No engine code was touched.

### Findings
No issues found.

### Spec Compliance Checklist
- [x] `src/defaults/prompts/spec.md` output template contains `## Acceptance Criteria` section with testable bullets AND new normative `## Required Sections` prose mandates it — `src/defaults/prompts/spec.md:72-79`
- [x] `.cycle/prompts/spec.md` matches `src/defaults/prompts/spec.md` after `npm run sync-defaults` — diff exits 0
- [x] `src/defaults/prompts/review.md` Pass 1 includes `**SPEC AC coverage**` bullet, "SPEC defect" language, "PLAN-inferred" prohibition, one-for-one check — `src/defaults/prompts/review.md:44-48`
- [x] `.cycle/prompts/review.md` matches `src/defaults/prompts/review.md` — diff exits 0
- [x] Full test suite passes: 603 passing, 0 failing
- [x] NEEDS-FIX triggers extended — `src/defaults/prompts/review.md:120-123`
- [x] Existing `/NEEDS-FIX triggers:[\s\S]*traceability/` regex preserved — "traceability" remains after new AC clause

### SPEC→PLAN Traceability
PLAN.md contains a complete `## SPEC Acceptance Traceability` section
(lines 246–254) that re-quotes all 5 SPEC AC bullets verbatim and maps
each to a covering task. No gaps.

## Adversarial Test Review

### Summary
Strong. Tests read real files from disk — no mocking. Assertions pin
exact strings required by SPEC, including one regex assertion for
cross-paragraph matching.

### Findings
No issues found. Notes only:

1. **Loose string match**: `body.includes("observable outcome")` in
   `spec-prompt-ac.test.ts:18` could match a future unrelated addition,
   but the string is specific enough and consistent with codebase pattern.
2. **No position test**: Tests do not assert `## Required Sections` is
   outside the fenced code block. Acceptable — no comparable test in the
   codebase checks prose placement relative to fences; content-presence
   tests are the established convention.
3. **No redundant byte-equality for review.md**: Correctly omitted;
   two pre-existing byte-equality tests already cover
   `review.md` (`plan-prompt-spec-traceability.test.ts:65`,
   `review-prompt-doc-claim-pass.test.ts:35`).

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 98.51% / 92.50% / 92.95%
- Regressions vs base (per-file): none — all per-file floors met
- New code without tests: none (prompt-text only change; both test files
  created and passing)
- Specific scenarios missing tests: none identified

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

(`src/defaults/prompts/` and `.cycle/prompts/` are not in scope paths
README.md, CLAUDE.md, AGENTS.md, or docs/**/*.md excluding docs/cycle/*.)
```

Written to stdout. No MUST-FIX.md created — no issues found.
