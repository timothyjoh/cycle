Need write permission. Once granted, PLAN.md goes to `docs/cycle/0164-quickfix-widen-step-agent-type-to-match-runtime-r/PLAN.md`.

Here's the full plan:

---

**Two-file fix:**

1. **`src/engine/exec.ts:22`** — swap `const REGISTRY: Record<string, ExecModule> = { … }` for `const REGISTRY = { … } satisfies Record<string, ExecModule>`. Then add: `export type AgentName = keyof typeof REGISTRY | "bash"`. The `satisfies` operator preserves the literal key union (`"claudecode" | "codex" | "gemini"`) instead of widening to `string`, while still enforcing the value shape. `"bash"` is added explicitly because it dispatches via `execBashStep` in `run-cycle.ts`, not through the REGISTRY.

2. **`src/engine/workflow.ts:1,7`** — add `import type { AgentName } from "./exec.ts"` and replace `agent: "claudecode" | "bash"` with `agent: AgentName`.

**One new test:**

`tests/engine/workflow.test.ts` — `"parses a workflow step with agent: codex"`: YAML fixture with a codex step, call `loadConfig`, assert `steps[0].agent === "codex"`. Primarily proves typecheck stops rejecting REGISTRY-derived names.
