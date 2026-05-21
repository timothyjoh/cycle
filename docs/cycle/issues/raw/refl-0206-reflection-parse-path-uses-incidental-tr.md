---
id: refl-0206-reflection-parse-path-uses-incidental-tr
source: reflection
title: reflection parse path uses incidental trimToLastBalancedClose for fence recovery instead of explicit stripFences
added_at: "2026-05-21T06:04:29.605Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0206"
---

Triage was explicitly hardened with `stripFences` as a first-class clean step. Reflection's `parseWithRepair` in `src/engine/reflection.ts:131` has no `stripFences` call — it relies on `trimToLastBalancedClose` scanning forward to the first `{` or `[`, which incidentally skips fence prefixes.

This is fragile in two ways: (1) if reflection output contains prose with a `{` before the fence (e.g. `Error in step {build}:...`), `trimToLastBalancedClose` would latch onto that `{` instead of the JSON payload; (2) the behavior is undocumented — a future refactor of `parseWithRepair` would silently break fence recovery without knowing it existed.

Fix: add `s = stripFences(s)` at the top of `parseWithRepair` before the first `JSON.parse`, matching the explicit pattern used in triage's `validateOutput`.
