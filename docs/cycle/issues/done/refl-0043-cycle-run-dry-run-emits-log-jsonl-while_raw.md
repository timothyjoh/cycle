---
id: refl-0043-cycle-run-dry-run-emits-log-jsonl-while
source: reflection
title: cycle-run-dry-run-emits-log-jsonl-while-cycle-drop-does-not
added_at: "2026-05-14T15:59:25.110Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0043"
---

`src/cli.ts:74-75` calls `createLogger(cwd)` and emits `engine.start` before the dry-run short-circuit at `:314-327`, so `cycle run "<text>" --dry-run` creates `.cycle/log.jsonl` in the consumer repo. `cycle drop` exits earlier and writes no log file. The new e2e test had to *avoid* asserting log absence (PLAN.md called this out explicitly), which signals the asymmetry is load-bearing for the test design.

This is a smell at the CLI surface: two "materialize-only" entry points behave differently for an externally observable side effect (a file appearing in `.cycle/`). Either consolidate by moving the dry-run short-circuit above logger creation on the `run` path (making the two paths symmetric) or document the asymmetry in CLAUDE.md so future maintainers don't accidentally remove the `engine.start` emit while "cleaning up". Either action takes <30 lines.
