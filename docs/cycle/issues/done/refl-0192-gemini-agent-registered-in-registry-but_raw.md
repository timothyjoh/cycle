---
id: refl-0192-gemini-agent-registered-in-registry-but
source: reflection
title: gemini agent registered in REGISTRY but absent from Step.agent union
added_at: "2026-05-20T02:43:45.409Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0192"
---

After this cycle added `"codex"` to the `Step.agent` union, `gemini` remains the only registered agent (`exec.ts:27`) that TypeScript still rejects in a workflow step. Any YAML step with `agent: gemini` parses at runtime but fails `tsc --noEmit` because `workflow.ts:7` declares `agent: "claudecode" | "bash" | "codex"` — the exact same type/runtime gap that motivated cycle 0192 for codex.

This is a one-line fix (`| "gemini"` in the union) and should be filed and drained before any workflow author tries to use gemini steps and hits a confusing type error. Follow the cycle 0192 pattern exactly.
