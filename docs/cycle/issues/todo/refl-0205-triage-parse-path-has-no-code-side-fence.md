---
id: refl-0205-triage-parse-path-has-no-code-side-fence
title: Add stripFences helper to triage parse path for deterministic fence removal
workflow: feature
depends_on: []
triaged_at: "2026-05-21T05:43:45.550Z"
source: triage
---
## Summary

`src/engine/triage.ts:394` calls `JSON.parse(rawStdout)` with no pre-processing. The prompt instruction added in cycle 0205 reduces fence-wrapping frequency but is probabilistic — prior data showed a 10% parse failure rate with 76% of failures caused by fence wrapping. A deterministic code-side strip eliminates this failure class entirely at near-zero cost.

The prompt instruction and the code-side strip are complementary: the instruction is the first line of defense; the strip is the safe fallback so the retry budget is not burned on a trivially recoverable error.

**Note:** `refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip` covers the same ground and is already queued. Once this item is implemented, that entry should be closed.

## Acceptance Criteria

- [ ] `stripFences(s: string): string` helper exists in `src/engine/triage.ts` or `src/engine/log-fmt.ts`
- [ ] Applied unconditionally before `JSON.parse` in `validateTriageOutput` (or equivalent call site at line 394)
- [ ] Strips leading ` ```json ` or bare ` ``` ` block opener and trailing ` ``` ` closer; passes through input with no fences unchanged
- [ ] Unit tests cover: no-fence passthrough, ` ```json ` wrapped input, bare ` ``` ` wrapped input, whitespace-padded variants
- [ ] Per-file coverage floor for `src/engine/triage.ts` (95%) maintained
- [ ] Full test suite passes (`npm test`)

## Location

`src/engine/triage.ts:394` — apply `stripFences` immediately before the `JSON.parse` call inside `validateTriageOutput`.

## Context

- Priority hint: 7 (high — directly reduces observed 10% triage parse failure rate)
- Origin: reflection on cycle 0205
- Cycle 0205 added prompt-level no-fences instruction; this adds the deterministic fallback
- `stripFences` should be a pure string → string function with no side effects; safe to apply unconditionally
