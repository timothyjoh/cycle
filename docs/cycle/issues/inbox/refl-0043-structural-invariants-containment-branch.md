---
id: refl-0043-structural-invariants-containment-branch
source: reflection
title: structural-invariants containment branches covered only by probe replica
added_at: 2026-06-03T14:42:44.863Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0043"
---

The new fail-loud containment paths in `scripts/structural-invariants.mjs` — the predicate-throw `catch`/`continue` (~lines 200-204) and the malformed-entry `else` (~lines 224-228) — are verified only against a hand-written re-implementation of the driver loop in a temp `probe.mjs` (`tests/scripts/structural-invariants.test.ts:140-187`), not against the real module. LCOV flags 201-204 and 224-228 as uncovered; the floor still holds at 94.81% ≥ 90%.

This matters because these are exactly the branches that guarantee a thrown/malformed predicate fails loud instead of being coerced to a silent pass — the engine's no-silent-failure posture. A future edit that removed the real `try/catch` or the malformed-entry guard would not fail any test nor drop below the floor, silently reopening the gap the branch exists to close. The probe faithfully mirrors the logic today, so this is a regression-guard gap, not a current correctness defect.

Suggested direction (per REVIEW.md finding 1): export the dispatch as `runInvariants(invariants, cwd)` and drive a throwing entry and a malformed (no `pattern`/`validate`) entry through the real function, replacing the probe replica so the actual containment branches are covered.
