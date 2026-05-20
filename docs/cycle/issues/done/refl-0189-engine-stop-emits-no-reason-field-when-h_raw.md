---
id: refl-0189-engine-stop-emits-no-reason-field-when-h
source: reflection
title: engine.stop emits no reason field when halted via scope-guard-loop
added_at: "2026-05-20T01:31:29.267Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0189"
---

When `engine.paused { reason: "commit-scope-guard-loop" }` fires and sets `halted = true`, the `haltReason` variable remains `null`. The subsequent `engine.stop` event at the end of `src/cli.ts` emits `{ status: "halted" }` with no `reason` field — unlike the `max_consecutive_failures` and `triage_failed` paths, which both populate `haltReason` and therefore include a reason in `engine.stop`.

An operator diffing `engine.stop` events across runs must scan backwards through the log to find the preceding `engine.paused` to learn why the engine stopped. Setting `haltReason` (or adding a dedicated field) in the scope-guard-loop path would make `engine.stop` self-describing and consistent with other halt paths.
