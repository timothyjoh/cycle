---
id: refl-0206-reflection-parse-path-uses-incidental-tr
title: Add explicit stripFences call to reflection parseWithRepair
workflow: feature
depends_on: []
triaged_at: "2026-05-21T06:06:50.368Z"
source: triage
---
## Problem

`parseWithRepair` in `src/engine/reflection.ts` relies on `trimToLastBalancedClose` scanning forward to the first `{` or `[` to incidentally skip fence prefixes. This is fragile in two ways:

1. **Wrong latch point**: if reflection output contains prose with a `{` before the JSON fence (e.g. `Error in step {build}:...`), `trimToLastBalancedClose` latches onto that `{` instead of the fence-wrapped payload, producing a parse failure or wrong result.
2. **Undocumented invariant**: the fence-skipping behavior is a side effect of balanced-close scanning, not an explicit contract. A future refactor of `parseWithRepair` would silently remove fence recovery without any test or comment signaling it existed.

Triage was hardened with an explicit `stripFences` call in cycle 0205/0206. Reflection's parse path was not updated in parallel.

## Fix

Add `s = stripFences(s)` at the top of `parseWithRepair`, before the first `JSON.parse` attempt. This matches the explicit pattern in triage's `validateOutput` and makes fence recovery a first-class documented step rather than an accidental property of the repair scan.

`stripFences` is already exported from `src/engine/log-fmt.ts` (added in cycle 0206) — no new utility needed.

## Location

- `src/engine/reflection.ts` — `parseWithRepair` function, around line 131: add `s = stripFences(s)` as first statement
- Import `stripFences` from `./log-fmt` if not already imported

## Acceptance Criteria

- `stripFences(s)` is called at the entry of `parseWithRepair`, before any `JSON.parse` or `trimToLastBalancedClose` invocation
- Unit test covers the prose-with-brace hazard: input like `Error in step {build}:\n\`\`\`json\n{"key":"val"}\n\`\`\`` is parsed to `{key: 'val'}`, not a parse failure
- Existing reflection parse tests continue to pass
- Coverage floor for `src/engine/reflection.ts` is maintained (95%)
