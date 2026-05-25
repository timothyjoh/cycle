---
id: refl-0251-no-args-integration-test-pins-to-jsonl-s
source: reflection
title: no-args integration test pins to JSONL stdout log format
added_at: "2026-05-25T23:48:04.988Z"
triage_attempts: 0
priority: low
origin_cycle_id: "0251"
---

In `tests/cli/help.test.ts:86`, the no-args test asserts `r.stdout.includes('"event":"engine.start"')`. This hardcodes the JSONL event format and assumes engine logs flow to stdout rather than stderr or a log file.

If log routing changes — e.g., separating structured JSONL to stderr for machine consumption and human-readable progress to stdout — this assertion would silently fail. The test would report exit 0 but miss the routing regression entirely.

Consider asserting on observable side-effects (queue state, exit code, absence of the old error string) rather than internal log format, or add a dedicated `engine.start` structured-output path that is part of the public contract.
