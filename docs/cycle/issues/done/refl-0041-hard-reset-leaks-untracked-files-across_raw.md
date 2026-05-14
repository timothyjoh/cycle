---
id: refl-0041-hard-reset-leaks-untracked-files-across
source: reflection
title: hard-reset-leaks-untracked-files-across-resume-retries
added_at: "2026-05-14T04:04:06.496Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0041"
---

`resetCycleBranchTo` does `git reset --hard <sha>` which discards tracked-file edits but preserves untracked paths. REVIEW.md Findings #2 and Adversarial Test gap #3 both flag this for the `fix` step, and the same hole already existed for `build` after cycle 0040 — SPEC for 0041 deliberately did not broaden the cleanup, so it is now load-bearing across two steps with no follow-up filed.

Concrete failure mode: agent drops `.tmp`, scratch debug files, partial codegen artifacts, or a `node_modules/` mutation between resumes. Next retry sees a 'clean' tracked tree but a polluted working dir; outputs differ from a true clean run even though the policy advertises determinism. Existing tests do not catch this — Test C (`resume at fix hard-resets…`) asserts tracked-file cleanliness only.

Suggested direction: add `git clean -fd` (or `-fdx` if we trust .gitignore) after `git reset --hard` inside `resetCycleBranchTo`, gated behind the same `cycle/`-branch guard. Add one integration test per reset-eligible step that seeds an untracked file pre-resume and asserts it is gone post-reset.
