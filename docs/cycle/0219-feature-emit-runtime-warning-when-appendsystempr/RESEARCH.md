RESEARCH.md written to `docs/cycle/0219-feature-emit-runtime-warning-when-appendsystempr/RESEARCH.md`.

Key findings for the planner:
- Warning insertion point: `run-cycle.ts:302` — right before `mod.runStep()`, where both `step.agent` and `appendSystemPrompt` are in scope
- Established pattern: `log.emit("step.warning", { cycle_id, step: step.name, reason, agent })` — three existing usages at lines 271/274/279
- All five non-claudecode modules silently discard `appendSystemPrompt` via rest spreads that `RunAgentOptions` doesn't declare
- Two open questions left for the planner: `log.emit` vs `console.warn`, and which step name to use in the new test
