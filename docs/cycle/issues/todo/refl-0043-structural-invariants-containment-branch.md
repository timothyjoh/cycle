---
id: refl-0043-structural-invariants-containment-branch
title: Cover structural-invariants containment branches against the real module,
  not a probe replica
workflow: feature
depends_on: []
triaged_at: 2026-06-03T14:47:07.990Z
source: triage
priority: medium
---
The fail-loud containment paths in `scripts/structural-invariants.mjs` — the predicate-throw `catch`/`continue` (~lines 200-204) and the malformed-entry `else` (no `pattern`/`validate`, ~lines 224-228) — are currently exercised only against a hand-written re-implementation of the driver loop in a temp `probe.mjs` (`tests/scripts/structural-invariants.test.ts:140-187`), not against the real module. LCOV flags lines 201-204 and 224-228 as uncovered; the per-file floor still holds (94.81% ≥ 90%).

## Why this matters

These are exactly the branches that guarantee a thrown or malformed predicate fails loud instead of being silently coerced to a pass — the engine's no-silent-failure posture. Because they are validated only by a faithful-but-separate replica, a future edit that removed the real `try/catch` or the malformed-entry guard would pass every test and stay above the coverage floor, silently reopening the gap the branches exist to close. This is a regression-guard gap, not a current correctness defect: the probe mirrors today's logic correctly.

## Direction (per REVIEW.md finding 1)

Export the dispatch loop from `scripts/structural-invariants.mjs` as a callable `runInvariants(invariants, cwd)` and drive the real function from the test with:
- an invariant entry whose `validate` (or `pattern` evaluation) **throws**, asserting it is contained as a `FAIL` (not coerced to pass), and
- a **malformed** entry with neither `pattern` nor `validate`, asserting it is reported as a `FAIL`.

Replace the `probe.mjs` replica in `tests/scripts/structural-invariants.test.ts` with these real-module drivers so the actual containment branches (201-204, 224-228) are covered. Keep the existing CLI entrypoint behavior unchanged (e.g. guard the auto-run so importing the module for tests does not execute the gate).

## Done when

- `runInvariants` (or equivalently named export) is exercised directly by the test for both the throwing-predicate and malformed-entry cases.
- The probe replica is removed.
- LCOV no longer flags lines 201-204 / 224-228 as uncovered; the `scripts/structural-invariants.mjs` floor does not decrease.
- `npm run check:coverage` and `npm run check:invariants` pass.
