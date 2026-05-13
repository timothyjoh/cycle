---
id: refl-0021-reflection-step-emitted-invalid-json-ski
title: "Harden ingestReflection parsing: fence-strip, repair pass, escalate unparsed stdout"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T19:05:45.043Z"
source: triage
---
## Context

From cycle 0021 reflection: `.cycle/log.jsonl` shows `reflection.skipped {reason: parse_error, message: "Expected ',' or '}' after property value in JSON at position 2934"}` for cycle 0020. The self-healing loop silently dropped whatever sharp edges that cycle would have surfaced — exactly the failure mode the reflection step exists to prevent for *other* work.

Reflection sits at the end of every cycle and is the only mechanism that converts in-cycle insight into queued follow-up. A parse failure today has **no retry, no schema-fallback, no human ping** — it just drops the data on the floor. As reflection runs become routine, occasional parse errors will accumulate into a meaningful gap between code-state and queue-state.

## Goal

Make `ingestReflection` resilient to common LLM output quirks and ensure no reflection output is silently lost.

## Scope

1. **Fence-strip before parse.** In `src/engine/reflection.ts:ingestReflection`, before `JSON.parse(stdout)`, strip leading/trailing whitespace and remove a wrapping ```` ```json ... ``` ```` or ```` ``` ... ``` ```` fence if present. Today the prompt forbids fences, but agents occasionally emit them anyway (see e.g. the triage retry-feedback path).

2. **One repair pass on parse failure.** If `JSON.parse` still throws after fence-strip, attempt one repair pass: trim everything after the last balanced `}` (or `]`) at depth zero. Only retry once; if it still fails, fall through to step 3.

3. **Escalate unparsed stdout instead of dropping it.** On continued parse failure, emit `reflection.skipped {reason: parse_error, message}` as today, AND write a `raw/refl-<cycleId>-parse-error.md` capturing the raw stdout (truncated to a reasonable cap, e.g. 8KB) in the body and `source: reflection`, `priority_hint: 7` (higher than typical reflection output — this is a self-healing gap) in frontmatter. Use the existing slug-collision suffix logic. That way a human or future triage pass can recover the intent rather than losing it.

4. **Tighten `prompts/reflection.md`.** Reinforce the JSON-only contract: add an explicit "no markdown fences, no trailing prose, the entire stdout must `JSON.parse` on the first try" line, and include a one-shot **bad output** example showing fenced/commented output rejected. Keep the existing schema example.

## Out of scope

- Re-running the reflection agent on parse failure (no LLM retry in this cycle — agents are slow and expensive; raw-escalation is sufficient).
- Reflection output schema versioning.
- Changes to `reflection.summary` shape.

## Tests

- Unit: `ingestReflection` accepts JSON wrapped in ```` ```json fences ```` and produces the same `raw/refl-*` files as bare JSON.
- Unit: `ingestReflection` accepts JSON with trailing commentary after the closing `}` and parses it correctly after the repair pass.
- Unit: `ingestReflection` on truly unparseable stdout emits `reflection.skipped {reason: parse_error}` AND writes a `raw/refl-<cycleId>-parse-error.md` containing the original stdout in the body.
- Unit: parse-error escalation respects existing slug-collision suffixing if multiple parse failures collide in one pass (unlikely but cheap to cover).
- Regression: existing happy-path test (`sharp_edges` array of objects, bare JSON) still passes unchanged.

## Acceptance criteria

- A cycle 0020-style fenced-JSON stdout from the reflection step produces queued `raw/refl-*` items instead of silent skip.
- Truly unparseable stdout produces a `raw/refl-<cycleId>-parse-error.md` capturing the stdout, AND the `reflection.skipped` event, AND does **not** flip `cycle.end` to failed (code change is already merged via `pr`).
- `prompts/reflection.md` includes a one-shot bad-output example and an explicit JSON-only contract line.
- Coverage does not decrease vs master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
