---
id: refl-0227-quick-fix-and-test-build-steps-excluded
source: reflection
title: quick_fix and test_build steps excluded from touched.json accumulation
added_at: "2026-05-21T14:40:57.128Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0227"
---

RESET_ELIGIBLE_STEPS is hardcoded as `["build", "fix"]` in `src/engine/run-cycle.ts:27`. The `quickfix` workflow uses `quick_fix` as its primary mutation step and `test_fix` for follow-up fixes; the `e2e-tests` workflow uses `test_build`. None of these step names appear in RESET_ELIGIBLE_STEPS, so no footprint is accumulated when those workflows run.

Consequence: every `quickfix` or `e2e-tests` commit will emit `commit.scope_warning` for every staged `src/` file because `touched.json` is either absent or empty. The warning is non-blocking, but it fires on every single commit for these workflows — making the signal permanently noisy and useless for those workflows.

Suggested fix: extend RESET_ELIGIBLE_STEPS to include `quick_fix`, `test_fix`, and `test_build`. Or generalize the mechanism so any step whose agent is `claudecode` (non-bash, non-verify) is eligible. The set should be derived from workflow definitions rather than hardcoded.
