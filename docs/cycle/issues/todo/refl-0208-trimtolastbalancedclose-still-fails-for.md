---
id: refl-0208-trimtolastbalancedclose-still-fails-for
title: Fix trimToLastBalancedClose to retry from progressively later brace positions for unfenced prose-with-braces
workflow: feature
depends_on: []
triaged_at: "2026-05-21T06:50:18.586Z"
source: triage
---
## Problem

Cycle 0208 fixed the fenced prose-with-brace hazard by calling `stripFences` before `JSON.parse` in `parseWithRepair`. The unfenced case remains broken.

Repro: reflection agent emits bare output such as:

```
Error in step {build}: failed.
{"sharp_edges":[]}
```

`stripFences` is a no-op (no fence present). `JSON.parse` fails on the full string. `trimToLastBalancedClose` is invoked as the repair fallback — it scans from the start, finds the `{` inside `{build}`, and returns `{build}: failed.\n{"sharp_edges":[]}` which is still invalid JSON. The reflection output is lost and a `refl-<cycleId>-parse-error.md` raw is emitted.

## Root cause

`trimToLastBalancedClose` starts scanning from index 0 and latches onto the first `{` or `[` it finds, which may be inside prose rather than the start of the JSON payload.

## Fix direction

Implement a progressive-retry strategy in the repair path: after `trimToLastBalancedClose` fails (result does not parse), advance the scan start position past that brace/bracket and retry. Continue until either `JSON.parse` succeeds or no further candidates exist.

Concrete approach:

1. Extract or modify `trimToLastBalancedClose` (in `src/engine/log-fmt.ts`) to accept an `startOffset` parameter (default `0`), so callers can re-invoke it from a later position.
2. In the repair loop in `src/engine/reflection.ts` `parseWithRepair`, after a `trimToLastBalancedClose` result still fails `JSON.parse`, find the next `{` or `[` after the previous start offset and retry. Iterate until success or exhaustion.
3. On exhaustion, preserve existing escalation to `refl-<cycleId>-parse-error.md`.

Alternative (simpler): scan for the LAST outermost `{` or `[` that opens a fully balanced JSON structure. This avoids iteration but requires a right-to-left scan.

## Acceptance criteria

- `parseWithRepair` succeeds on `"Error in step {build}: failed.\n{\"sharp_edges\":[]}"` and returns `{ sharp_edges: [] }`.
- `parseWithRepair` succeeds on `"Prose {with: braces} and more prose\n[1,2,3]"` and returns `[1,2,3]`.
- Existing `trimToLastBalancedClose` and `parseWithRepair` tests continue to pass.
- `src/engine/log-fmt.ts` and `src/engine/reflection.ts` maintain 100% and existing coverage floors respectively.
- `npm run test:coverage && npm run check:coverage` passes with no regressions.

## Scope

Primary files: `src/engine/log-fmt.ts`, `src/engine/reflection.ts`, corresponding test files.

Do not touch triage's `validateOutput` — that is covered by `refl-0208-triage-validateoutput-has-no-trimtolastb` once a shared utility is extracted.

## Notes

- This is foundational to `refl-0208-triage-validateoutput-has-no-trimtolastb`, which extracts a shared `parseJsonWithRepair` helper. Fix the retry logic here first so the extracted helper carries the correct behaviour.
- The `redesign-07-reflection-three-bucket-rewrite` will eventually restructure how sharp edges are routed, but does not eliminate this parse correctness requirement.
