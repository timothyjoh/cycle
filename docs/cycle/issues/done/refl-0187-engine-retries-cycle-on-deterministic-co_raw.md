---
id: refl-0187-engine-retries-cycle-on-deterministic-co
source: reflection
title: engine retries cycle on deterministic commit-scope-guard failure with no escalation cap
added_at: "2026-05-19T17:38:34.546Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0187"
---

Cycle 0187 appears in the log with at least three separate build→review→verify→documentation→reflection runs (repeated `step.start` events for `build` under `cycle_id: 0187`). Each retry is triggered by a commit-scope-guard rejection. Because the violation is deterministic (documentation files and test files absent from BUILD.md Touched Files), every retry produces an identical failure at full AI agent cost (~20 min per pass).

The engine `max_consecutive_failures` cap applies to terminal step failures, but commit-scope-guard rejections appear to be classified as retriable, bypassing that cap. This creates an unbounded retry loop on a structurally unchanging failure condition.

Suggested fix: detect repeated commit-scope-guard failures on the same `cycle_id` (≥2 with the same violation set) and either auto-patch BUILD.md Touched Files from the actual diff, or escalate to `engine.paused` with a diagnostic rather than retrying indefinitely.
