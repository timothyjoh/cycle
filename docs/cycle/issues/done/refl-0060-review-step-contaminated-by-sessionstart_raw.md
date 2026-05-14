---
id: refl-0060-review-step-contaminated-by-sessionstart
source: reflection
title: review-step-contaminated-by-sessionstart-hooks-skipped-all-passes
added_at: "2026-05-14T21:59:04.908Z"
triage_attempts: 0
priority_hint: 9
origin_cycle_id: "0060"
---

Cycle 0060's `REVIEW.md` is 9 lines of caveman-mode + clarifying-question chatter ("Caveman mode on. No explicit task in message — just review.md prompt content + session hooks." / "What want? Options:") instead of the Pass 1 / Pass 2 / Pass 3 structure the review prompt mandates. The reviewer agent inherited SessionStart-hook directives (caveman mode banner, learning-mode insight injection, MCP server instructions) and treated them as a higher-priority user message than the cycle's review prompt. Result: no MUST-FIX.md materialized, no findings against the diff, the fix step ran as a no-op, and the cycle shipped without an actual review.

This is the most urgent edge surfaced this cycle because Pass 3 is the new gate this very cycle added — and the very first cycle that should have exercised it didn't run any pass at all. The contract pinned by `tests/defaults/review-prompt-doc-claim-pass.test.ts` only guarantees prompt prose is present on disk; it does not guarantee the reviewer agent actually executes the prompt.

Suggested direction: harden the review step against session-injected noise. Options: (a) strip or sandbox SessionStart hook output from the review agent's invocation environment in `src/engine/exec.ts`; (b) add a post-condition guard like the spec-step `SPEC_MIN_BYTES` check that asserts REVIEW.md contains at minimum `## Pass 1`, `## Pass 2`, `## Pass 3`, and `## Overall Verdict` headings before `step.end` marks the step ok; (c) escalate failures with a `step.warning {reason:"review_contract_missing"}` and surface to MUST-FIX.md so the fix step can rerun review.
