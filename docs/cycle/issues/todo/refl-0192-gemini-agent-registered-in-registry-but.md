---
id: refl-0192-gemini-agent-registered-in-registry-but
title: Add `gemini` to Step.agent union to close TypeScript type/runtime gap
workflow: feature
depends_on: []
triaged_at: "2026-05-20T02:47:52.144Z"
source: triage
---
## Context

Cycle 0192 promoted `codex` to a first-class agent by adding `"codex"` to the `Step.agent` union in `src/engine/workflow.ts`. The identical type/runtime gap exists for `gemini`: it is registered in the agent registry (`src/engine/exec.ts:27`) and dispatched correctly at runtime, but `workflow.ts:7` declares `agent: "claudecode" | "bash" | "codex"` — omitting `"gemini"`. Any workflow YAML step with `agent: gemini` silently passes runtime parsing but fails `tsc --noEmit` with a type error, which will confuse workflow authors.

This is a one-line fix. Follow the cycle 0192 pattern exactly.

## What to do

1. In `src/engine/workflow.ts`, add `"gemini"` to the `Step.agent` union on the same line where `"codex"` was added in cycle 0192.
2. Run `tsc --noEmit` — must exit 0 with no new errors.
3. Add a test mirroring the codex workflow-parsing test added in cycle 0192: assert that a workflow step with `agent: gemini` parses without TypeScript or runtime complaint.
4. Run `npm test` — all 535+ tests must pass, coverage gates must not regress.
5. Verify `ARCHITECTURE.md` "Registered step agents" bullet is accurate for gemini (it was already listed; confirm wording matches reality after this fix).

## Acceptance criteria

- `src/engine/workflow.ts` `Step.agent` union includes `"gemini"`.
- `tsc --noEmit` exits 0.
- At least one test validates parsing a workflow step with `agent: gemini` (cardinality-pinned if it emits an engine event).
- `npm test` green; line ≥ 95%, branch ≥ 75%, function ≥ 90% coverage gates pass.
- ARCHITECTURE.md agent list accurate.
