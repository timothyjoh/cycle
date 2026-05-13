---
id: refl-0023-dry-run-untested-paths-runagent-throws-a
source: reflection
title: dry-run-untested-paths-runagent-throws-and-missing-prompt-template
added_at: "2026-05-13T19:42:58.583Z"
triage_attempts: 1
priority_hint: 4
origin_cycle_id: "0023"
---

Adversarial REVIEW Findings 3 and 3.iii list two `dryRunTriage` code paths reached only via shared coverage with `runTriage`: (a) `runAgent` throws, exercising the `try/catch` at `src/engine/triage.ts:99` and the `lastError: 'agent failed: …'` shape inside the dry-run report; (b) the prompt template file is missing, where the current code lets `readFile`'s ENOENT propagate — behavior is reasonable but undocumented and untested for the dry-run entry point.

This matters because the canonical use case (operator iterating on the triage prompt after `engine.paused`) is exactly when the prompt file is most likely to be in a half-edited / renamed / missing state, and when an agent process is most likely to crash mid-edit. Today both surface as opaque report rows or stack traces.

Suggested direction: add two unit cases in `tests/engine/triage-dry-run.test.ts` — one stubs `runAgent` to throw and asserts the report row carries `status: 'failed'` and `last_error: /agent failed/`, one removes the prompt template and asserts the behavior we want (either a clean per-raw `last_error: 'prompt template missing: …'` row, or a single top-level error before any agent invocations). Pick one shape and pin it.
