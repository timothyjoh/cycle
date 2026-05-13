---
id: txt-20260513-034359-bb-4-build-the-triage-subroutine-new-src
source: text
title: "BB-4: Build the triage subroutine. New src/engine/triage.ts: spawn claudecode subprocess with the prompt from workflows.yml triage section, parse JSON to stdout, validate schema (children[], ordering[], decomposed_parents[]), apply atomically (write todo/<id>.md files, move raw->done/_raw, update tbd.jsonl). Per-raw retry up to 3 attempts; on each retry feed back the validator error as one-shot self-correction. If all raws fail in one pass, emit engine.paused and exit. New src/defaults/prompts/triage.md prompt template. Wire trigger points in run-cycle.ts: at engine.start when no in-progress cycle, and between cycles when raw/ is non-empty (per RFC section 10). See docs/RFC-001-issue-lifecycle.md sections 5, 10, 12 (BB-4)."
added_at: 2026-05-13T03:43:59.351Z
triage_attempts: 0
---

BB-4: Build the triage subroutine. New src/engine/triage.ts: spawn claudecode subprocess with the prompt from workflows.yml triage section, parse JSON to stdout, validate schema (children[], ordering[], decomposed_parents[]), apply atomically (write todo/<id>.md files, move raw->done/_raw, update tbd.jsonl). Per-raw retry up to 3 attempts; on each retry feed back the validator error as one-shot self-correction. If all raws fail in one pass, emit engine.paused and exit. New src/defaults/prompts/triage.md prompt template. Wire trigger points in run-cycle.ts: at engine.start when no in-progress cycle, and between cycles when raw/ is non-empty (per RFC section 10). See docs/RFC-001-issue-lifecycle.md sections 5, 10, 12 (BB-4).
