---
id: refl-0228-discuss-routing-test-does-not-assert-sou
source: reflection
title: discuss-routing test does not assert source file absent from raw/
added_at: "2026-05-21T15:40:29.625Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0228"
---

Test 1 in `triage-priority.test.ts` asserts `discuss/<id>.md` exists with correct content, but does not assert `raw/<id>.md` is absent after parking. A regression where `parkForDiscussion` is changed from `rename` to `copyFile` + delete (or simply a copyFile with no delete) would pass the test. The missing assertion is: `assert.rejects(() => readFile(join(root, 'docs/cycle/issues/raw', id + '.md'), 'utf8'))` or a `readdir` check. This was called out in REVIEW adversarial finding 3 and was not addressed in FIX.md.
