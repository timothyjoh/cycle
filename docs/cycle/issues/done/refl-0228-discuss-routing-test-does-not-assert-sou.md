---
id: refl-0228-discuss-routing-test-does-not-assert-sou
title: Assert raw/<id>.md absent after parkForDiscussion in triage-priority tests
workflow: feature
depends_on: []
triaged_at: "2026-05-21T15:42:24.783Z"
source: triage
---
## Problem

Test 1 in `tests/triage-priority.test.ts` verifies that `parkForDiscussion` writes the correct file to `discuss/<id>.md` but does not assert that `raw/<id>.md` is absent afterward. A regression that changes `rename` to `copyFile` (without the paired `unlink`) would pass all current assertions silently.

This gap was identified as adversarial finding 3 in the cycle 0228 REVIEW but was not addressed in FIX.md.

## Fix

In the parking test(s) that call `parkForDiscussion`, add an assertion after the operation confirming the source file no longer exists:

```ts
await assert.rejects(
  () => readFile(join(root, 'docs/cycle/issues/raw', id + '.md'), 'utf8'),
  { code: 'ENOENT' }
);
```

Alternatively, read `docs/cycle/issues/raw/` with `readdir` and assert the id is absent from the listing.

## Acceptance criteria

- Test 1 (and any other test exercising `parkForDiscussion`) fails if the implementation copies without deleting.
- All existing tests continue to pass.
- Coverage floors are met (`npm run test:coverage && npm run check:coverage`).

## Files

- `tests/triage-priority.test.ts` — add the missing post-condition assertion.
