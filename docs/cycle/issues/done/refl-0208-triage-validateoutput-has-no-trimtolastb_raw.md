---
id: refl-0208-triage-validateoutput-has-no-trimtolastb
source: reflection
title: triage validateOutput has no trimToLastBalancedClose repair pass
added_at: "2026-05-21T06:46:36.580Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0208"
---

Reflection's `parseWithRepair` has two-pass defense: `stripFences` then `trimToLastBalancedClose` as fallback. Triage's `validateOutput` has only one-pass: `JSON.parse(stripFences(rawStdout))`. If triage emits trailing prose without a fence (e.g. a closing sentence after the JSON object), `stripFences` is a no-op and `JSON.parse` fails outright — no repair attempted.

This asymmetry means triage is more brittle than reflection for unfenced trailing-prose output. Given that fenced output from triage was already an issue in earlier cycles, unfenced trailing prose is a plausible real failure mode.

Fix direction: extract a shared `parseJsonWithRepair(s)` utility (wrapping `stripFences` + `JSON.parse` + `trimToLastBalancedClose` fallback) and call it from both `validateOutput` in `triage.ts` and `parseWithRepair` in `reflection.ts`. This also deduplicates the two independent implementations.
