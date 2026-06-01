---
id: refl-0015-compress-output-hook-fail-open-swallows
source: reflection
title: compress-output-hook fail-open swallows parse errors with no signal
added_at: 2026-05-31T22:46:39.906Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0015"
---

`runCompressOutputHook` (src/cli/compress-output-hook.ts:24,25,36) returns empty stdout / exit 0 on every degrade path — malformed JSON, missing command, and the bare `catch {}` — emitting no log or stderr diagnostic. SPEC line 30 explicitly requires hook errors be "logged, never swallowed into a blocked tool call," but the implementation only satisfies the "never blocked" half. A systematic failure (e.g. claude's PreToolUse event schema drifts so `tool_input.command` is never found) would silently disable compression for every command with zero observable signal, so a real hook regression is undetectable.

Suggested direction: on the catch path (and optionally the unexpected-shape early returns) write a one-line diagnostic to stderr. A claude PreToolUse hook that exits 0 with stderr surfaces the message without blocking the tool call, preserving fail-open while making persistent failures visible. Add a test asserting the catch path writes to stderr.
