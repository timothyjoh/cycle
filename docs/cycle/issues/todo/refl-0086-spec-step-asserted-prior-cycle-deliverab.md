---
id: refl-0086-spec-step-asserted-prior-cycle-deliverab
title: Add Prior Deliverable Verification clause to spec.md prompt
workflow: feature
depends_on: []
triaged_at: "2026-05-16T02:51:12.634Z"
source: triage
---
## Problem

Cycle 0086 SPEC.md stated: "The existing test assertion for `--dangerously-skip-permissions` (from cycle 0085) must pass with the fix applied" — framing the test pin as already delivered. It was not. The SPEC step never verified.

The PLAN step caught this discrepancy independently (`The SPEC assumed the test assertion landed in cycle 0085 — it did not`), but only because the PLAN agent happened to check the file. This is fragile redundancy: the spec propagated a false assumption downstream, causing the build strategy to be scoped incorrectly until the PLAN step corrected it.

This failure mode — SPEC asserting a prior cycle's deliverable as present without verification — has now recurred across multiple cycles (0085 → 0086). A structural prompt fix is required.

## Required change

Add a `## Prior Deliverable Verification` clause to `src/defaults/prompts/spec.md` requiring the spec agent to:

1. Identify any prior-cycle artifacts named as existing dependencies (e.g., "the test from cycle 0085", "the guard added in 0082", "the assertion landed in refl-XXXX").
2. Verify each named artifact is actually present in the current codebase via a direct file check (`grep -n` or `cat`) before listing it as an existing dependency. Show the command and its output inline.
3. If the artifact is absent, remove it from the dependency list, note the gap explicitly, and include delivering it as an additional SPEC acceptance criterion.

The clause must be phrased so the agent cannot silently skip it: it requires naming each assumed prior deliverable and showing the verification result before the SPEC is finalized.

## Files to change

- `src/defaults/prompts/spec.md` — add the clause
- `.cycle/prompts/spec.md` — sync to byte-identical (or add a pinning test in `tests/defaults/` enforcing parity)

Check divergence guard state on `.cycle/prompts/spec.md` before syncing (`npm run sync-defaults` will report if it is locally divergent).

## Acceptance criteria

1. `src/defaults/prompts/spec.md` contains a `## Prior Deliverable Verification` section (or equivalent prominently placed clause) with the three-step requirement above.
2. `.cycle/prompts/spec.md` is byte-identical to the default, OR a pinning test in `tests/defaults/spec-prompt-prior-deliverable-verification.test.ts` asserts the clause is present in both files.
3. The clause is specific enough that an agent cannot skip it: it must name each assumed prior deliverable, show a verification shell command, and show the command's output.
4. `npm test` passes; coverage does not regress.

## Notes

- Related: `refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check` (structurally unreachable ACs) — that issue targets a different failure mode (unreachable criteria), but both indicate the spec step needs stronger self-validation discipline.
- The pinning test approach (byte-identical assertion for both the default and dogfood mirror) is preferred over manual sync to prevent future drift, following the pattern established by `tests/defaults/review-prompt-doc-claim-pass.test.ts` and `tests/defaults/plan-prompt-spec-traceability.test.ts`.
