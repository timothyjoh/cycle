---
id: refl-0187-build-step-omits-test-file-changes-from
source: reflection
title: build-step omits test-file changes from BUILD.md Touched Files causing scope-guard blocks
added_at: "2026-05-19T17:38:34.546Z"
triage_attempts: 1
priority_hint: 7
origin_cycle_id: "0187"
---

In cycle 0187, `tests/defaults/feature-loadable.test.ts` was modified by the build step but was not listed in BUILD.md Touched Files. REVIEW.md (Pass 1) explicitly identifies this as a contributing cause of the scopeGuard commit block, distinct from the documentation-step ordering problem (already tracked as `refl-0187-scopeguard-blocks-documentation-step-fil`).

This is a systematic reliability gap: BUILD.md Touched Files is manually maintained and test file changes are consistently missed. Each miss causes a commit-scope-guard failure and a full-cost retry cycle.

Suggested fix: at build-step completion, auto-populate BUILD.md Touched Files from `git diff --name-only` relative to the cycle base, rather than relying on the agent to enumerate files by hand.
