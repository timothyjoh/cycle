---
id: refl-0214-review-prompt-tests-missing-trailing-com
title: Add missing trailing-commentary prohibition assertion to review-prompt tests
workflow: feature
depends_on: []
triaged_at: "2026-05-21T23:25:56.267Z"
source: triage
priority: medium
---
## Problem

`tests/defaults/review-prompt-spec-ac.test.ts` covers the File Artifact Mode guardrail in `src/defaults/prompts/review.md`, but only three of the four prohibition bullets are tested:

1. Insight blocks / star-marker commentary — covered
2. Confirmation sentences — covered
3. Guardrail header sentence — covered
4. Trailing commentary addressed to the reader — **NOT covered**

If the trailing-commentary bullet is accidentally removed or reworded in the prompt, no test catches the regression.

## Fix

Before implementing, read `src/defaults/prompts/review.md` and locate the exact phrase used in the trailing-commentary prohibition bullet in the File Artifact Mode guardrail section. Use that exact substring in the assertion.

Add a fourth `it()` assertion to the File Artifact Mode guardrail `describe` block in `tests/defaults/review-prompt-spec-ac.test.ts`:

```ts
it('prohibits trailing commentary addressed to the reader', () => {
  expect(body).toContain('<exact phrase from review.md guardrail section>');
});
```

## Acceptance Criteria

- [ ] A fourth assertion exists in `tests/defaults/review-prompt-spec-ac.test.ts` checking for the trailing-commentary prohibition text
- [ ] The substring matches the exact phrase from the guardrail section in `src/defaults/prompts/review.md`
- [ ] `npm test` passes with no regressions
- [ ] Coverage gates hold (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
