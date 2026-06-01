---
id: refl-0015-compress-output-hook-fail-open-swallows
title: Surface compress-output-hook degrade paths to stderr instead of silently
  swallowing
workflow: feature
depends_on: []
triaged_at: 2026-05-31T22:50:41.540Z
source: triage
priority: medium
---
`runCompressOutputHook` (src/cli/compress-output-hook.ts:24,25,36) returns empty stdout / exit 0 on every degrade path — malformed JSON, missing command, and the bare `catch {}` — emitting no log or stderr diagnostic. SPEC line 30 requires hook errors be "logged, never swallowed into a blocked tool call," but the implementation only satisfies the "never blocked" half. A systematic failure (e.g. claude's PreToolUse event schema drifts so `tool_input.command` is never found) would silently disable compression for every command with zero observable signal, making a real hook regression undetectable.

Fix: on the catch path (and optionally the unexpected-shape early returns) write a one-line diagnostic to stderr. A claude PreToolUse hook that exits 0 with stderr surfaces the message without blocking the tool call, preserving the fail-open contract while making persistent failures visible. Keep exit 0 and empty stdout on every degrade path — only add the stderr signal.

Tests: add coverage asserting the catch path (and the malformed-JSON / missing-command early returns, if they also emit) write a non-empty stderr diagnostic while still exiting 0 with empty stdout. Maintain the `src/cli/compress-output-hook.ts` coverage floor (70%).
