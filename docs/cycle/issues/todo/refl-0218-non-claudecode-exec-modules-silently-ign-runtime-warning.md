---
id: refl-0218-non-claudecode-exec-modules-silently-ign-runtime-warning
title: Emit runtime warning when appendSystemPrompt is set for a non-claudecode agent
workflow: feature
depends_on: []
triaged_at: "2026-05-21T10:49:17.934Z"
source: triage
parent: refl-0218-non-claudecode-exec-modules-silently-ign
---
## Problem

Cycle 0218 added `appendSystemPrompt?: string` to `ExecModule.runStep` and wired it only in `claudecodeExec`. The five other registered exec modules (`exec-codex.ts`, `exec-gemini.ts`, `exec-auggie.ts`, `exec-opencode.ts`, `exec-pi.ts`) destructure their args without touching `appendSystemPrompt`, so the field is silently discarded. Any workflow step with `agent: codex` (or the other four) that falls in `ARTIFACT_STEPS` receives no suppression — contamination prevention is a silent no-op with no diagnostic.

## Acceptance criteria

- [ ] `run-cycle.ts` or `exec.ts` emits a console warning (or engine log event) when `appendSystemPrompt` is non-empty and the resolved agent is not `claudecode`.
- [ ] Warning names the agent and the unsupported field, e.g.: `[cycle] appendSystemPrompt ignored for agent 'codex' — only claudecodeExec implements this field`.
- [ ] A unit test asserts the warning fires for at least one non-claudecode agent when `appendSystemPrompt` is set.
- [ ] No regression in existing exec tests.
- [ ] Coverage gates pass (`npm run test:coverage && npm run check:coverage`).

## Notes

This is the defensive minimum from option (b) in the cycle 0218 reflection. Makes silent failures visible without requiring CLI research into the five other agents. Full generic forwarding is tracked in `refl-0218-non-claudecode-exec-modules-silently-ign-generic-forwarding`.
