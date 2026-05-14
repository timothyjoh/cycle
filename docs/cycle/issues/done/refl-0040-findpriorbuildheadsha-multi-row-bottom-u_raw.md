---
id: refl-0040-findpriorbuildheadsha-multi-row-bottom-u
source: reflection
title: findpriorbuildheadsha-multi-row-bottom-up-untested
added_at: "2026-05-14T03:39:14.265Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0040"
---

`findPriorBuildHeadSha` walks `.cycle/log.jsonl` bottom-up so the latest matching `build` `step.start` wins. This is the exact shape produced by the self-healing warning paths: a `build_pre_sha_missing` or `build_pre_sha_unreachable` warning re-emits `step.start` with the current HEAD, and the *next* resume must pick that re-emitted row, not the stale one.

REVIEW.md (Adversarial Test Review, finding 5) flagged this gap as "implicit from bottom-up scan but not exercised." Self-healing is the whole reason both warning paths re-emit — leaving it untested means a regression that flips the scan order (top-down or first-match) would silently break recovery from a stuck cycle without flipping any other test red.

Direction: in `tests/engine/run-cycle.test.ts`, add a `findPriorBuildHeadSha` case with two `build` `step.start` rows for the same `cycle_id` (older SHA + newer SHA after a simulated warning re-emit) and assert it returns the newer one.
