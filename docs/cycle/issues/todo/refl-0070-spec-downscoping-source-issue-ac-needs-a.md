---
id: refl-0070-spec-downscoping-source-issue-ac-needs-a
title: "Spec-authoring discipline: enumerate inherited source-issue ACs in SPEC.md (carried / refined / dropped-with-rationale)"
workflow: feature
depends_on: []
triaged_at: "2026-05-15T20:58:00.773Z"
source: triage
---
## Context

Cycle 0070 review (Adversarial Test Review finding 2) caught a defect-shipping path that traces back to silent AC downscoping at the SPEC step. The source issue `refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics` listed an integration-test AC, and SPEC.md downscoped it with the rationale "No new integration test fixture for this cycle — the unit matrix covers the gate matrix fully". That downscope was the proximate cause of the cycle_id-reuse defect: unit tests passed because they manually invoked `runCycle()` with identical cycleId on both attempts, isolating from the broken CLI flow where `drainFailedRetry` was deleting `cycle_id`. The reviewer caught it, but the cycle still spent ~30 min on a build/review/fix loop that a stricter spec gate would have avoided.

This is not a one-off. The SPEC step has no friction against silently dropping source-issue ACs. There is no convention requiring the spec to either honor each source AC or explicitly justify dropping it with a rationale that another reviewer can push back on.

## Acceptance criteria

- [ ] `src/defaults/prompts/spec.md` instructs the SPEC author to emit an `## Inherited Acceptance Criteria` section that enumerates every AC from the source issue (the `todo/<id>.md` body that triggered the cycle).
- [ ] Each enumerated inherited AC is annotated as one of: `carried-over` (kept verbatim or close), `refined` (kept but rewritten — must reference the new AC ID), or `dropped-with-rationale` (must include a rationale paragraph another reviewer could push back on; "unit coverage suffices" alone is insufficient — must justify why end-to-end coverage is not needed at this seam).
- [ ] `src/defaults/prompts/review.md` Pass 3 (Doc-vs-Code Claim Verification) is extended (or a sibling pass added) to anchored-grep-verify the inherited-AC list against the source `todo/<id>.md` at HEAD; any silent drop (source AC text present in todo body but absent from `## Inherited Acceptance Criteria`) is treated as a Pass-3-style claim-verification failure that flows through MUST-FIX.md → fix step.
- [ ] Dogfood mirror `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` are byte-identical to the `src/defaults/prompts/*` versions (sync-defaults run after edits) — pin with a test if convenient.
- [ ] At least one regression test pins the review-step rejection of a SPEC.md that omits the `## Inherited Acceptance Criteria` section when the source `todo/<id>.md` body contains any `- [ ]` AC bullets.

## Notes

- Pairs naturally with `refl-0028-plan-step-silently-dropped-spec-annotati` (PLAN-vs-SPEC traceability) — same shape one layer down. Consider whether the inherited-AC convention should cascade through PLAN as well, or whether SPEC is the only authoritative inheritance boundary.
- Pairs with `refl-0046-spec-ac-6-was-structurally-unreachable-f-spec-feasibility-self-check` and `refl-0069-spec-ac-said-cycle-branch-but-dogfood-wo` — all three are spec.md prompt hardening. Order does not matter strictly but bundling into a single spec-prompt-hardening cycle could be considered at PLAN time.
- Origin: cycle 0070 reflection, `priority_hint: 6`.
