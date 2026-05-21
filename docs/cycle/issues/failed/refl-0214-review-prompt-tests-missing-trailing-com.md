---
id: refl-0214-review-prompt-tests-missing-trailing-com
title: Add missing trailing-commentary prohibition assertion to review-prompt tests
workflow: feature
depends_on: []
triaged_at: "2026-05-21T09:04:09.589Z"
source: triage
failed_at: "2026-05-21T09:13:16.943Z"
failed_step: build
failed_attempts: 3
last_cycle_id: "0215"
---
## Problem

`tests/defaults/review-prompt-spec-ac.test.ts` was added in cycle 0214 with three assertions covering the File Artifact Mode guardrail in `src/defaults/prompts/review.md`. The guardrail lists four prohibition bullets:

1. Insight blocks / star-marker commentary — **covered**
2. Confirmation sentences — **covered**
3. Guardrail header sentence — **covered**
4. Trailing commentary addressed to the reader — **NOT covered**

If the trailing-commentary bullet is accidentally removed, renamed, or reworded in the prompt, no test will catch the regression.

## Fix

Add a fourth `it()` assertion to the File Artifact Mode guardrail describe block in `tests/defaults/review-prompt-spec-ac.test.ts`:

```ts
it('prohibits trailing commentary addressed to the reader', () => {
  expect(body).toContain('trailing commentary');
});
```

Adjust the substring to match the exact phrase used in `src/defaults/prompts/review.md`'s guardrail section before implementing.

## Acceptance Criteria

- [ ] A fourth assertion exists in `tests/defaults/review-prompt-spec-ac.test.ts` checking for the trailing-commentary prohibition text
- [ ] The substring matches the exact phrase from the guardrail section in `src/defaults/prompts/review.md`
- [ ] `npm test` passes with no regressions
- [ ] Coverage gates hold (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
