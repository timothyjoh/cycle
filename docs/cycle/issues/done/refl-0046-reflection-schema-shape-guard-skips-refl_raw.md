---
id: refl-0046-reflection-schema-shape-guard-skips-refl
source: reflection
title: reflection-schema-shape-guard-skips-reflection-summary-emission
added_at: "2026-05-14T16:57:01.574Z"
triage_attempts: 0
priority_hint: 2
origin_cycle_id: "0046"
---

`src/engine/reflection.ts:57-64` (the "missing `sharp_edges` array" branch) emits `reflection.skipped {reason: "invalid_entry", message}` but does NOT emit a trailing `reflection.summary` event, while every other terminal branch of `ingestReflection` does (happy path, parse-error escalation, exec_failed). BUILD.md explicitly calls this out as deferred and intentionally out of scope per SPEC; REVIEW.md and the existing test at `tests/engine/reflection.test.ts:427-440` pin the asymmetric behavior.

Why it matters: log-tail consumers (`src/engine/log-tail.ts`, future telemetry, the README recovery doc) currently treat `reflection.summary` as the cycle-end marker for the reflection step. The schema-shape failure path leaves no summary, so downstream parsers must special-case "saw `reflection.skipped {reason:"invalid_entry"}` without a summary" or risk treating the cycle as still mid-reflection. This is a small but real observability burr that gets bigger as more consumers depend on the summary event.

Suggested direction: emit `reflection.summary {count: 0, skipped: 1}` in the schema-shape guard branch, mirroring the parse-error escalation path. One-line addition (`await log.emit("reflection.summary", { cycle_id, count: 0, skipped: 1 })` before the early return). Add a one-line test extension at `tests/engine/reflection.test.ts:427-440` asserting the summary event fires. Pure observability fix; no behavior change to the queue or raw files.
