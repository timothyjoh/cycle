---
id: refl-0187-engine-retries-cycle-on-deterministic-co
title: Escalate engine to paused on repeated commit-scope-guard failures for same cycle
workflow: feature
depends_on: []
triaged_at: "2026-05-19T17:41:50.057Z"
source: triage
---
## Problem

When a commit-scope-guard violation fires repeatedly on the same `cycle_id`, the engine retries unconditionally. Because the violation set is deterministic (documentation or test files absent from BUILD.md Touched Files), every retry reproduces the identical failure at full AI agent cost (~20 min/pass). The `max_consecutive_failures` cap does not apply because commit-scope-guard rejections are classified as retriable, not terminal.

## Root Cause

The engine has no per-`cycle_id` counter for commit-scope-guard rejections. Without a counter it cannot detect that it has entered a deterministic retry loop on the same structural violation.

## Fix

Add a per-`cycle_id` counter for commit-scope-guard rejections. When the count reaches ≥2 consecutive rejections with the same violation set, emit `engine.paused` with `reason: "commit-scope-guard-loop"` and the violation details instead of queuing another retry.

### Acceptance criteria

- [ ] Engine tracks commit-scope-guard rejection count per `cycle_id`.
- [ ] On the 2nd consecutive rejection for the same `cycle_id`, emit `engine.paused` with `reason: "commit-scope-guard-loop"` and a `violations` payload.
- [ ] First rejection still allows one retry (threshold is ≥2, not ≥1).
- [ ] A successful commit resets the per-cycle counter.
- [ ] Unit test: two consecutive scope-guard rejections on the same `cycle_id` → `engine.paused` emitted exactly once (use `expectExactlyOne` from `tests/helpers.ts`).
- [ ] Unit test: one rejection followed by successful commit → no `engine.paused` emitted.
- [ ] `npm test` passes; per-file coverage floors not broken.

## Implementation notes

Likely touch `src/engine/run-cycle.ts` and/or `src/engine/commit-cycle.ts`. The counter can live in a `Map<cycle_id, number>` scoped to the engine run (not persisted). The `engine.paused` event shape already exists; extend the `reason` union or use a structured `diagnostics` field consistent with current usage.

## Related issues

- `refl-0187-scopeguard-blocks-documentation-step-fil` — auto-appends documentation-step output paths to BUILD.md (root-cause fix)
- `refl-0187-build-step-omits-test-file-changes-from` — auto-populates BUILD.md Touched Files from git diff at build-step completion (root-cause fix)

This is a defensive safety net; implement independently of whether the root-cause fixes land first.
