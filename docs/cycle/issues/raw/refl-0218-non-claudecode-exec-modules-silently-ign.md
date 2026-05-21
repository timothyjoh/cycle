---
id: refl-0218-non-claudecode-exec-modules-silently-ign
source: reflection
title: non-claudecode exec modules silently ignore appendSystemPrompt — contamination suppression absent for codex/gemini/auggie/opencode/pi
added_at: "2026-05-21T10:40:38.491Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0218"
---

Cycle 0218 added `appendSystemPrompt?: string` to `ExecModule.runStep` and wired it in `claudecodeExec` only. The five other registered exec modules (`exec-codex.ts`, `exec-gemini.ts`, `exec-auggie.ts`, `exec-opencode.ts`, `exec-pi.ts`) destructure their args without touching `appendSystemPrompt`, so it is silently discarded. Any workflow step with `agent: codex` (or the other four) that falls in `ARTIFACT_STEPS` receives no suppression flag — contamination prevention is a no-op for those agents.

The fix is to either (a) forward `appendSystemPrompt` through `runAgent` → `exec-spawn.ts` generically so all agents benefit, or (b) document the claudecode-only scope in `exec.ts` and add a runtime warning when `appendSystemPrompt` is set for a non-claudecode agent. Option (a) requires checking whether codex/gemini/etc. CLIs support an equivalent flag; option (b) prevents silent failures at minimum.
