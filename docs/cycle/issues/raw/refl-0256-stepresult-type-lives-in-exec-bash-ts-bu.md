---
id: refl-0256-stepresult-type-lives-in-exec-bash-ts-bu
source: reflection
title: StepResult type lives in exec-bash.ts but rateLimited field is never set by that module
added_at: "2026-05-26T10:27:02.460Z"
triage_attempts: 0
priority: low
origin_cycle_id: "0256"
---

`StepResult` is defined in `src/engine/exec-bash.ts` because that file predated rate-limit detection. Now the type carries `rateLimited?: true` — a field `execBashStep` explicitly never sets. The type's home is misleading: bash is the one agent excluded from rate-limit detection, yet it owns the shared result type.

This will compound as `StepResult` grows. The natural fix is to move the type to a shared `src/engine/exec-types.ts` (or `src/engine/types.ts`) and re-export from `exec-bash.ts` for backwards compatibility.

Low urgency — no behavior affected — but each future `StepResult` field added to `exec-bash.ts` deepens the confusion.
