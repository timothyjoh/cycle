---
id: refl-0053-close-3-non-blocking-test-gaps-flagged-i
source: reflection
title: close 3 non-blocking test gaps flagged in cycle 0053 review
added_at: "2026-05-14T19:22:03.174Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0053"
---

`REVIEW.md` §Adversarial Test Review findings 1-3 logged three concrete `sanitize-artifact.test.ts` gaps and explicitly marked them non-blocking, so no MUST-FIX was created and no follow-up issue exists yet:

1. Idempotence (`f(f(x)) === f(x)`) is asserted only on the clean payload at `tests/engine/sanitize-artifact.test.ts:15-20`. SPEC §Requirements demands idempotence "for any input". Add a second `assert.equal` round-trip on the compound case (Test 2's narration + outer-fence input).
2. No test pins the narration-only payload → `""` contract. `PLAN.md:106` explicitly designed `(?:\n|$)` for this case (`"Now done."` with no trailing newline) but no case exercises it directly.
3. No test covers the language-tag-optional arm `(?:\w+)?` on a narration-then-bare-fence input (`"Now build.\n\n```\nbody\n```\n"`). Test 2 covers the `markdown` tag; the no-tag variant is untested.

All three are pure-function additions to the existing test file — tens of lines, no infra changes, no coverage rerun beyond the helper's already-100% block. Closes the contract gaps cleanly without touching the helper or the seam.
