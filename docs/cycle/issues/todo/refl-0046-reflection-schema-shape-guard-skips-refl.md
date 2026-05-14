---
id: refl-0046-reflection-schema-shape-guard-skips-refl
title: Emit `reflection.summary` from schema-shape guard branch in ingestReflection
workflow: feature
depends_on: []
triaged_at: "2026-05-14T16:58:01.314Z"
source: triage
---
## Problem

`src/engine/reflection.ts:57-64` (the schema-shape guard branch for missing `sharp_edges` array) emits `reflection.skipped {reason: "invalid_entry", message}` but does NOT emit a trailing `reflection.summary` event. Every other terminal branch of `ingestReflection` does emit a summary (happy path, parse-error escalation, `exec_failed`).

BUILD.md for cycle 0046 explicitly called this out as deferred / intentionally out of scope per SPEC; REVIEW.md and the existing test at `tests/engine/reflection.test.ts:427-440` currently pin the asymmetric behavior.

## Why it matters

Log-tail consumers (`src/engine/log-tail.ts`, future telemetry, the README recovery doc) treat `reflection.summary` as the cycle-end marker for the reflection step. The schema-shape failure path leaves no summary, so downstream parsers must special-case "saw `reflection.skipped {reason:"invalid_entry"}` without a summary" or risk treating the cycle as still mid-reflection. Small but real observability burr that grows as more consumers depend on the summary event.

## Acceptance

1. `ingestReflection` schema-shape guard branch (missing/non-array `sharp_edges`) emits `reflection.summary {cycle_id, count: 0, skipped: 1}` immediately before its early return, mirroring the parse-error escalation path's summary shape.
2. All four terminal branches of `ingestReflection` now uniformly emit exactly one `reflection.summary` per invocation (happy path, parse-error escalation, schema-shape `invalid_entry`, `exec_failed`).
3. Existing test at `tests/engine/reflection.test.ts:427-440` extended (or new sibling test added) to assert: (a) one `reflection.skipped {reason: "invalid_entry"}` event, AND (b) one trailing `reflection.summary {count: 0, skipped: 1}` event, with the summary ordered *after* the skipped event.
4. No queue or filesystem behavior change — no raw files materialized, no `tbd.jsonl` mutations. Pure observability fix.
5. Coverage thresholds hold (line ≥ 95%, branch ≥ 75%, function ≥ 90%); the new code path is fully covered by the test extension.

## Pointers

- File: `src/engine/reflection.ts:57-64` — the schema-shape guard branch.
- Reference branches that already emit summary: parse-error escalation path (look for the `reflection.summary` call after `refl-<cycleId>-parse-error.md` is written) and the happy path's terminating summary emission.
- Test file: `tests/engine/reflection.test.ts:427-440` — existing test that pins the current asymmetric behavior; update it (do not duplicate) so the suite asserts the new symmetric contract.
- Doc cross-check: `CLAUDE.md` reflection-step paragraph describes `reflection.summary` as part of every terminal branch — once this fix lands, the doc and code agree without caveat.

## Out of scope

- No changes to schema-shape error message text or `reflection.skipped` event payload.
- No new validation of `sharp_edges` entry contents beyond what already exists.
- No log-tail consumer refactors — those continue to work; this just removes the special case they would have needed.
