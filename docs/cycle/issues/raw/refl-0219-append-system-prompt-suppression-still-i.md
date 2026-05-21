---
id: refl-0219-append-system-prompt-suppression-still-i
source: reflection
title: "--append-system-prompt suppression still ineffective: SPEC.md contaminated in cycle 0219 after cycle 0218 fix"
added_at: "2026-05-21T11:08:41.968Z"
triage_attempts: 0
priority_hint: 8
origin_cycle_id: "0219"
---

Cycle 0218 added `ARTIFACT_SUPPRESS_PROMPT` injection via `--append-system-prompt` to all artifact steps in `run-cycle.ts`. Cycle 0219 ran with that fix in place yet SPEC.md was still contaminated with learning-mode narration (`"SPEC.md written for cycle 0219..."`) — the review noted it as "same artifact contamination pattern that cycles 0214–0218 were fighting."

The argv ordering in `exec-claudecode.ts` is correct (`--append-system-prompt` precedes `-p`), so flag ordering is not the cause. The most likely explanation is that `--append-system-prompt` appends to system prompt context but cannot override the stronger learning-mode instructions injected by the session hook (`SessionStart` injects `CAVEMAN MODE ACTIVE` and learning-mode setup). The appended instruction competes with existing session context rather than replacing it.

Suggested direction: supplement `--append-system-prompt` with in-prompt injection — prepend or append a `FILE ARTIFACT MODE: output only document contents, no narration` directive directly inside the prompt template files (`spec.md`, `plan.md`, etc.) so suppression is present at the user-turn level regardless of system prompt ordering. Belt-and-suspenders until a more reliable mechanism is confirmed.
