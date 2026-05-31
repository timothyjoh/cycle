# Final Fixes — Cycle 0012

> Footprint: CLAUDE.md, docs/ENGINE.md, src/engine/run-cycle.ts

## Fix 1: hoist duplicated failed-bash gate in run-cycle step.end

The predicate `step.agent === "bash" && r.status === "failed"` is written twice in `src/engine/run-cycle.ts` — once to guard the `.out` capture block (~line 501) and again in the `step.end` spread that adds the `stdout` excerpt field (~line 525). The two gates must stay byte-identical: if a future edit changes one but not the other, the engine emits a `stdout` excerpt with no backing `.out` artifact (or writes the artifact while omitting the excerpt), producing inconsistent observability that no current test pins.

Mechanical fix in a file already touched this cycle: lift the condition into a single `const isFailedBash = step.agent === "bash" && r.status === "failed";` above the capture block and reuse it for both the guard and the spread. No behavior change, no design decision.
