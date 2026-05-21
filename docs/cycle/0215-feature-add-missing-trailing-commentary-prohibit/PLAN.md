# Implementation Plan: Cycle 0215

## Overview

Add one missing `test()` block to `tests/defaults/review-prompt-spec-ac.test.ts` asserting that the `review.md` File Artifact Mode guardrail explicitly prohibits trailing commentary. This closes the coverage gap where three of the four prohibition bullets are tested but the fourth (trailing commentary) is not.

## Current State (from Research)

`tests/defaults/review-prompt-spec-ac.test.ts` has 7 test blocks; three cover File Artifact Mode (lines 40–62): the guardrail header, the insight-blocks prohibition, and the confirmation-sentences prohibition. The trailing-commentary prohibition bullet at `src/defaults/prompts/review.md:120` (`trailing commentary addressed to the reader`) has no corresponding assertion. The prompt text already contains the correct language — only the test is missing.

## Desired End State

`tests/defaults/review-prompt-spec-ac.test.ts` has 8 test blocks. `npm test` reports 612 tests passing. The new test asserts `body.includes("trailing commentary")` against the same `SRC` constant used by the surrounding tests.

## What We're NOT Doing

- Modifying `src/defaults/prompts/review.md` — the guardrail text already exists.
- Running `npm run sync-defaults` — no prompt source was changed.
- Adding assertions to `spec-prompt-ac.test.ts` or any other test file.
- Adding a per-file coverage floor for `tests/defaults/review-prompt-spec-ac.test.ts`.

## Implementation Approach

Single-file, single-block addition. Append one `test()` block after line 62 of the test file, following the exact naming and assertion patterns established by the two adjacent File Artifact Mode tests.

---

## Task 1: Add Trailing-Commentary Test Block

### Overview

Append one `test()` block to `tests/defaults/review-prompt-spec-ac.test.ts` that asserts `body.includes("trailing commentary")`.

### Changes Required

**File**: `tests/defaults/review-prompt-spec-ac.test.ts`

After line 62 (end of the `"review prompt File Artifact Mode prohibits confirmation sentences"` block), append:

```ts
test("review prompt File Artifact Mode prohibits trailing commentary", async () => {
  const body = await readFile(SRC, "utf8");
  assert.ok(
    body.includes("trailing commentary"),
    "missing trailing commentary prohibition in File Artifact Mode guardrail",
  );
});
```

No imports, no new constants, no other file changes required.

### Success Criteria

- [ ] `npm test` exits 0 with 612 tests reported (up from 611)
- [ ] The new test name appears in output: `review prompt File Artifact Mode prohibits trailing commentary`
- [ ] `npm run test:coverage` exits 0 with all coverage gates met
- [ ] No other test changes or regressions

---

## SPEC Acceptance Traceability

> Note: `SPEC.md` is contaminated — the file body is agent narration rather than a structured spec document, and contains no `## Acceptance Criteria` section. The issue title and RESEARCH.md are used as the authoritative requirement source.

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| Add one test asserting `trailing commentary` substring in `review.md`'s guardrail section | Task 1 | Derived from issue title and RESEARCH.md; SPEC.md has no formal AC section due to contamination |

---

## Testing Strategy

### Unit Tests

- One new `test()` block in `tests/defaults/review-prompt-spec-ac.test.ts`.
- Asserts `body.includes("trailing commentary")` — exact substring present at `src/defaults/prompts/review.md:120`.
- No mocking; test reads the real file from disk, matching all seven existing tests in this file.

### Integration / E2E Tests

- `npm test` (full suite) verifies no regressions across all 612 tests.
- `npm run test:coverage` verifies coverage gates are not degraded.

## Risk Assessment

- **No risk of false negative**: substring `"trailing commentary"` is confirmed present at `review.md:120`; test will pass immediately.
- **No risk of regression**: change is additive — one new test block, zero source modifications.
- **SPEC contamination**: SPEC.md is not usable as a structured artifact; RESEARCH.md fully captures the requirement. This is a known issue for the reflection step to surface.
