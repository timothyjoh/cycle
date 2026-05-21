# Spec: Cycle 0219 — Emit Runtime Warning for appendSystemPrompt on Non-claudecode Agents

## Problem
When `appendSystemPrompt` is set for a step using a non-claudecode agent (codex, gemini, auggie, opencode, pi), the field is silently discarded. No warning is emitted, so the caller has no signal that the configuration is being ignored.

## Solution
Emit a `step.warning` log event at the `mod.runStep` call site in `run-cycle.ts` when `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`.

## Out of Scope
- Generic forwarding of `appendSystemPrompt` to non-claudecode exec modules (tracked separately)
- Warning when `appendSystemPrompt` is explicitly `undefined`
- Modifying any exec module implementation

## Acceptance Criteria
- [ ] `run-cycle.ts` or `exec.ts` emits an engine log event (`step.warning`) when `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`.
- [ ] The warning payload names the agent and the unsupported field (e.g. `agent: "codex"`, `reason: "append_system_prompt_ignored"`).
- [ ] A unit test asserts the warning fires for at least one non-claudecode agent when `appendSystemPrompt` is set.
- [ ] No regression in existing exec tests.
- [ ] Coverage gates pass (`npm run test:coverage && npm run check:coverage`).
