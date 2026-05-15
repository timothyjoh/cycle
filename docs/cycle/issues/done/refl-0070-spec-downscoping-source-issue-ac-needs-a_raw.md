---
id: refl-0070-spec-downscoping-source-issue-ac-needs-a
source: reflection
title: spec-downscoping-source-issue-ac-needs-a-discipline-gate
added_at: "2026-05-15T20:46:56.718Z"
triage_attempts: 1
priority_hint: 6
origin_cycle_id: "0070"
---

REVIEW.md (Adversarial Test Review finding 2) called this out explicitly: the source issue `refl-0028-engine-retries-redo-spec-research-plan-w-retry-economics` listed an integration-test AC, and SPEC.md downscoped it ("No new integration test fixture for this cycle — the unit matrix covers the gate matrix fully"). That downscope is the proximate cause of the cycle_id-reuse defect shipping — the SPEC author chose unit coverage over end-to-end coverage at the exact seam where the defect lived.

This isn't a one-off: SPEC step has no friction against silently dropping source-issue ACs. There's no convention requiring the spec to either honor each source AC or explicitly justify dropping it with a rationale that another reviewer could push back on. The reviewer caught it this time, but the cycle still spent ~30 min on a build/review/fix loop that a stricter spec gate would have avoided.

Suggested direction: extend `src/defaults/prompts/spec.md` so the SPEC must enumerate every source-issue acceptance criterion under an `## Inherited Acceptance Criteria` section and mark each as carried-over, refined, or dropped-with-rationale. Review prompt can then anchored-grep-verify the inherited-AC list against the source issue at HEAD, treating any silent drop as a Pass-3-style claim-verification failure.
