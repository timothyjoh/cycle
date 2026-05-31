# Final Fixes — Cycle 0006

> Footprint: .cycle/workflows.yml, CLAUDE.md, docs/workflows.md, src/defaults/workflows.yml, src/engine/exec.ts, src/engine/workflow.ts, tests/engine/run-cycle.step-end-stderr-dispatch.test.ts, tests/engine/run-cycle.test.ts

## Fix 1: docs-workflows-canonical-schema-stale-after-defaults-rewrite

`docs/workflows.md` was touched this cycle (a new `## Top-level defaults` section was appended), but the canonical schema example at the top was not reconciled with the shipped-defaults rewrite. Line 13 still states the file "has three top-level sections" — it now has four (`engine`, `triage`, `defaults`, `workflows`) — and the example steps at lines 30-36 still carry per-step `agent: claudecode`, the exact style this cycle removed from `src/defaults/workflows.yml`/`.cycle/workflows.yml` in favor of inheritance from `defaults`. The user-facing config reference now shows two contradictory step styles and an undercounted section list.

This matters because `docs/workflows.md` is the surface MUST-FIX Task 1 chose as the home for the new feature; leaving the primary example out of sync re-introduces the same drift the fix was meant to close. Suggested direction: correct "three top-level sections" to four (defaults optional) and either convert the canonical example to the new defaults-inheritance form or annotate that per-step `agent:` is now optional when a default is set.
