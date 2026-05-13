---
id: multi-agent-abstraction
source: text
title: "Multi-agent abstraction: support codex / gemini alongside claudecode"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 8
---

## Why

`workflows.yml` declares `agent: claudecode` per step and per triage. The engine should accept other values like `codex`, `gemini`, etc. via pluggable exec modules paralleling `src/engine/exec-claudecode.ts`.

## Acceptance
- New modules: `src/engine/exec-codex.ts`, `src/engine/exec-gemini.ts` (or whichever come first)
- Each has the same shape as `exec-claudecode.ts`: `runStep({prompt, tools, env, ...}) -> {stdout, exit}`
- Engine dispatch table maps string -> exec module
- Unknown agent name returns a clear error (no silent fallback)
- Tests use mocked subprocesses

## Non-goals
- Don't implement provider-specific quirks beyond basic input/output parity
- Don't change the existing claudecode path
