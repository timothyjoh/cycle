---
id: refl-0040-findpriorbuildheadsha-multi-row-bottom-u
title: Cover findPriorBuildHeadSha bottom-up scan with two-row same-cycle regression test
workflow: feature
depends_on: []
triaged_at: "2026-05-14T03:42:31.492Z"
source: triage
---
## Problem

`findPriorBuildHeadSha` (in `src/engine/run-cycle.ts`) walks `.cycle/log.jsonl` bottom-up so the **latest** `build` `step.start` row for a given `cycle_id` wins. This is the exact shape produced by the Policy-1 self-healing warning paths:

- `build_pre_sha_missing` and `build_pre_sha_unreachable` each emit `step.warning`, then re-emit `step.start` with `head_sha = currentHead`.
- The *next* resume must pick that **re-emitted** row, not the stale original.

REVIEW.md from cycle 0040 (Adversarial Test Review, finding 5) flagged this gap as "implicit from bottom-up scan but not exercised." A regression that flipped the scan order (top-down or first-match) would silently break self-healing recovery from a stuck `build` step without flipping any other test red.

## Acceptance

- New unit test in `tests/engine/run-cycle.test.ts` covering `findPriorBuildHeadSha`:
  - Fixture log contains, in order, two `build` `step.start` rows for the same `cycle_id` and step name `build`:
    1. older row with `head_sha: "<OLD_SHA>"`
    2. newer row with `head_sha: "<NEW_SHA>"` (simulating the re-emit after a `build_pre_sha_missing` or `build_pre_sha_unreachable` warning)
  - Assert `findPriorBuildHeadSha(repoRoot, cycleId)` returns `"<NEW_SHA>"` (the newer row), not `"<OLD_SHA>"`.
  - Optionally interleave a `step.warning` row between them to mirror the real on-disk shape; not required for the assertion but documents intent.
- Test must fail if the scan order is flipped top-down or first-match, so a future refactor cannot silently regress self-healing.
- No production code changes required; this is a pure regression-test add. If the production behavior is found to disagree with the bottom-up contract during test authoring, file that as a separate raw — do not silently fix it here.

## Out of scope

- Refactoring `findPriorBuildHeadSha` itself. Test-only change.
- Covering `build_pre_sha_unreachable` end-to-end (already covered by Policy-1 integration tests).
- Cross-cycle scan behavior (different `cycle_id`s); only same-cycle multi-row ordering is in scope here.

## References

- Origin: `docs/cycle/0040-feature-define-enforce-restart-policy-for-build/REVIEW.md`, Adversarial Test Review finding 5.
- Implementation: `findPriorBuildHeadSha` in `src/engine/run-cycle.ts`.
- Existing log-tail patterns: `src/engine/log-tail.ts` (bottom-up scanner reference).
- Policy doc: CLAUDE.md → "Build-step restart policy (Policy 1, hard reset to pre-`build` HEAD)".
