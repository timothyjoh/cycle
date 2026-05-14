---
id: refl-0060-review-step-contaminated-by-sessionstart-headings-postcondition
title: Gate REVIEW.md write on Pass 1 / Pass 2 / Pass 3 / Overall Verdict headings present
workflow: feature
depends_on: [refl-0060-pass-3-contract-pinned-by-prose-tests-on-review-pass-3-postcondition]
triaged_at: "2026-05-14T22:04:09.562Z"
source: triage
parent: refl-0060-review-step-contaminated-by-sessionstart
---
Cycle 0060's `REVIEW.md` was 9 lines of caveman-mode + clarifying-question chatter ("Caveman mode on. No explicit task in message — just review.md prompt content + session hooks." / "What want? Options:") instead of the Pass 1 / Pass 2 / Pass 3 structure the review prompt mandates. The reviewer agent inherited SessionStart-hook directives (caveman mode banner, learning-mode insight injection, MCP server instructions) and treated them as a higher-priority user message than the cycle's review prompt. Result: no `MUST-FIX.md` materialized, no findings against the diff, the fix step ran as a no-op, and the cycle shipped without an actual review.

Pass 3 was the new gate this very cycle added — and the very first cycle that should have exercised it didn't run any pass at all. The contract pinned by `tests/defaults/review-prompt-doc-claim-pass.test.ts` only guarantees prompt prose is present on disk; it does not guarantee the reviewer agent actually executes the prompt.

## Scope

Extend the diff-conditional Pass 3 post-condition guard (see dep `refl-0060-pass-3-contract-pinned-by-prose-tests-on-review-pass-3-postcondition`) to cover the full set of mandatory REVIEW.md section headers — unconditionally, not only when in-scope doc paths changed. Pass 1 / Pass 2 / Pass 3 always run; the gate must reflect that.

After the existing artifact-write seam in `src/engine/run-cycle.ts`, when `step.name === "review"`, measure the sanitized REVIEW.md body against this required header set:

- `## Pass 1`
- `## Pass 2`
- `## Pass 3` (literal: `## Doc-vs-Code Claim Verification`, matching the prompt's exact subheading)
- `## Overall Verdict`

When any required header is missing, mutate `r.status = "failed"` with stderr `review post-condition failed: <abs-path> missing required header(s): <comma-list>` (via an exported `formatReviewGuardError(absPath, missingHeaders)` helper mirroring `formatSpecGuardError`) before `step.end` emits. The failure falls through the standard `cycle.end status:"failed" failing_step:"review"` branch — same retry path as any other terminal step failure. Bash `review` steps bypass the guard (agent-branch seam is the only call site).

## Why this is broader than the Pass 3 dep

- Pass 3 dep gates **only** on `## Doc-vs-Code Claim Verification` and **only** when the cycle diff touches in-scope doc paths.
- This raw saw an empty REVIEW.md where **no passes ran at all** and **no doc paths changed** — Pass 3 dep would have skipped the gate entirely.
- Required scope here is the unconditional review contract (Pass 1/2/3 + Overall Verdict, every cycle, every workflow), layered on top of the diff-conditional Pass 3 clause.

Land after the Pass 3 dep so the Pass 3 helper structure exists and can be reused.

## Acceptance

1. Regression test: REVIEW.md stdout missing `## Pass 1` → `step.end {step:"review", status:"failed"}` + `cycle.end status:"failed" failing_step:"review"`.
2. Regression test: REVIEW.md stdout missing `## Overall Verdict` → same failure path.
3. Regression test: REVIEW.md stdout containing all four headers → step passes (boundary).
4. Regression test: stderr on failure exactly matches `formatReviewGuardError` output, including absolute path and missing-header comma list.
5. Existing review-happy-path tests continue to pass.
6. CLAUDE.md "Review step Pass 3" paragraph extended to document the full-header post-condition contract.

## Out of scope

- Root-cause environment sandboxing of SessionStart hooks (covered by `refl-0054-learning-mode-insight-blocks-leak-into-c-audit-suppress-output-style-propagation`).
- Resetting `triage_attempts` on retained raws (covered by `refl-0059-triage-attempts-3-on-paused-raw-blocks-r`).
- Reviewer-agent prompt-priority hardening; this raw enforces output contract, not input handling.
