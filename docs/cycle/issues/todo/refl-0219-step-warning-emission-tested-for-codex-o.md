---
id: refl-0219-step-warning-emission-tested-for-codex-o
title: Pin step.warning cardinality for all four non-claudecode agents (gemini, auggie, opencode, pi)
workflow: feature
depends_on: []
triaged_at: "2026-05-21T23:27:34.552Z"
source: triage
priority: medium
---
## Problem

`tests/engine/run-cycle.append-system-prompt-warning.test.ts` only covers the `codex` agent for the `appendSystemPrompt` suppression warning. The production guard in `run-cycle.ts` uses `step.agent !== "claudecode"`, which applies equally to `gemini`, `auggie`, `opencode`, and `pi`. Without cardinality assertions for these four agents, a refactor introducing agent-specific branching or a constant rename could silently drop the warning for any of them without causing a test failure.

## Acceptance Criteria

- `tests/engine/run-cycle.append-system-prompt-warning.test.ts` asserts `step.warning` fires exactly once for each of `gemini`, `auggie`, `opencode`, and `pi` when `appendSystemPrompt` is set on a build step using that agent.
- Each assertion uses `filter().length === 1` or `expectExactlyOne` per the cardinality-pinning convention in CLAUDE.md.
- No new test file: extend the existing file with parametrized cases or four additional `it` blocks.
- All existing tests continue to pass (`npm test`).
- Coverage does not decrease.

## Implementation Notes

Preferred approach: parametrize over `["codex", "gemini", "auggie", "opencode", "pi"]` in a single loop so the codex case is also covered by the same structure, eliminating the existing one-off codex test if it becomes redundant.

Alternatively, four additional `it` blocks (one per agent) are acceptable if parametrization adds noise.

Each test needs a minimal stub workflow with `agent: "<name>"` and `appendSystemPrompt: "suppress"` on a build step; the run should emit `step.warning` with a message referencing the suppressed field. Mirror the existing codex test structure exactly, only swapping the agent name.

See `tests/engine/run-cycle.append-system-prompt-warning.test.ts` for the current codex-only fixture.
