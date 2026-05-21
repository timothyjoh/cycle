---
id: refl-0208-triage-validateoutput-has-no-trimtolastb
title: Extract shared parseJsonWithRepair and wire into triage validateOutput
workflow: feature
depends_on: [refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip]
triaged_at: "2026-05-21T06:49:15.274Z"
source: triage
blocked_at: "2026-05-21T07:30:39.153Z"
blocked_by: [refl-0202-triage-agent-emits-markdown-fenced-json-fence-strip]
---
## Problem

Triage's `validateOutput` in `src/engine/triage.ts` uses a single-pass parse:

```ts
JSON.parse(stripFences(rawStdout))
```

Reflection's `parseWithRepair` in `src/engine/reflection.ts` uses two passes: `stripFences` then `trimToLastBalancedClose` as fallback. If triage output contains trailing unfenced prose after a valid JSON object, `stripFences` is a no-op and `JSON.parse` throws with no repair attempted.

This asymmetry makes triage more brittle than reflection for the same class of LLM output deviation.

## Fix

Extract a shared `parseJsonWithRepair(s: string): unknown` utility into `src/engine/log-fmt.ts` (where `stripFences` and `truncateHeadCapped` already live). The utility should:

1. Try `JSON.parse(stripFences(s))`.
2. On failure, try `JSON.parse(trimToLastBalancedClose(stripFences(s)))` as a fallback.
3. Throw the original parse error if both passes fail.

Then:
- Replace the inline `JSON.parse(stripFences(...))` call in `validateOutput` (`triage.ts`) with `parseJsonWithRepair`.
- Replace the equivalent logic in `parseWithRepair` (`reflection.ts`) with `parseJsonWithRepair`.

This deduplicates two independent implementations and makes both callers equally resilient.

## Acceptance criteria

- `parseJsonWithRepair` exported from `src/engine/log-fmt.ts` with full unit tests covering: clean JSON, fenced JSON, trailing-prose JSON (unfenced), and unrecoverable input.
- `triage.ts` `validateOutput` and `reflection.ts` `parseWithRepair` both delegate to `parseJsonWithRepair`.
- No inline `trimToLastBalancedClose` repair logic remains in `reflection.ts`.
- All per-file coverage floors maintained (`src/engine/log-fmt.ts` 100%, `src/engine/triage.ts` 95%, `src/engine/reflection.ts` existing floor).
- `npm test` passes with no regressions.
