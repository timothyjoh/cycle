Research document written to `docs/cycle/0192-feature-add-codex-as-a-first-class-agent-option/RESEARCH.md`.

Key findings for the planner:

- **Type gap**: `Step.agent` at `workflow.ts:7` is `"claudecode" | "bash"` — `"codex"` missing. `ExecModule.runStep` at `exec.ts:6-12` has no `model`/`thinking` params.
- **Runtime already works**: `codex` is in the `REGISTRY` at `exec.ts:22-26`. Only TS type is wrong.
- **Insertion points**: `exec-codex.ts:6` (`argv: []` → build flags array there), `run-cycle.ts:288` (forward `step.model`/`step.thinking` to `runStep`).
- **Sibling modules safe**: `claudecodeExec` and `geminiExec` spread `...args` — adding optional fields to the interface won't touch them.
- **Test pattern is clear**: fake binary echoing `"$@"` to stdout, call `resolveAgent("codex").runStep(...)` with model/thinking in args.
- **Open question flagged**: ARCHITECTURE.md says `codex exec --yolo` but current impl spawns `codex` with `argv: []`. Planner needs to confirm the argv baseline.
