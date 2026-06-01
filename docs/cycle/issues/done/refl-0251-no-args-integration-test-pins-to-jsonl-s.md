---
id: refl-0251-no-args-integration-test-pins-to-jsonl-s
title: Decouple no-args integration test from internal JSONL log format
workflow: feature
depends_on: []
triaged_at: "2026-05-26T00:00:02.190Z"
source: triage
priority: low
---
## Problem

In `tests/cli/help.test.ts:86`, the no-args test asserts:

```ts
r.stdout.includes('"event":"engine.start"')
```

This hardcodes two implementation details simultaneously:
1. The JSONL structured event format (`{"event":"..."}`).
2. The assumption that engine events flow to stdout rather than stderr or a dedicated log file.

If log routing changes — e.g., separating structured JSONL to stderr for machine consumers and human-readable progress to stdout — this assertion silently fails. The test reports exit 0 but misses the routing regression entirely.

## Fix

Replace the `engine.start` JSONL string match with assertions on observable, stable side-effects:

- Exit code is `0`.
- stdout does **not** contain the old no-args error string (e.g., `ERR_PARSE_ARGS_UNKNOWN_OPTION` or `Unknown argument`).
- Optionally: stdout contains a stable sentinel from the queue-drain path (e.g., `"event":"engine.halted"` if that is considered public contract, or a human-readable progress line if one is emitted).

If `engine.start` on stdout is intentionally part of the machine-readable public contract, document it explicitly in `BRIEF.md` or `docs/ARCHITECTURE.md` and add a comment in the test anchoring it to that contract decision.

## Acceptance criteria

- `tests/cli/help.test.ts` no-args test no longer asserts on `'"event":"engine.start"'`.
- Test still fails if no-args invocation crashes or returns non-zero exit.
- Test passes after log routing is changed to stderr without modifying the test.
- Coverage floors unaffected (`src/cli.ts` ≥ floor, `tests/cli/help.test.ts` fully exercised).
