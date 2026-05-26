# Final Fixes — Cycle 0256

> Footprint: .cycle/workflows.yml, CLAUDE.md, docs/ENGINE.md, src/defaults/workflows.yml, src/engine/exec-auggie.ts, src/engine/exec-bash.ts, src/engine/exec-claudecode.ts, src/engine/exec-codex.ts, src/engine/exec-gemini.ts, src/engine/exec-opencode.ts, src/engine/exec-pi.ts, src/engine/run-cycle.ts, src/engine/workflow.ts, tests/engine/exec-auggie.test.ts, tests/engine/exec-claudecode.test.ts, tests/engine/exec-codex.test.ts, tests/engine/exec-gemini.test.ts, tests/engine/exec-opencode.test.ts, tests/engine/exec-pi.test.ts

## Fix 1: r! non-null assertion in run-cycle.ts after while(true) loop

After the `while(true)` retry loop, TypeScript requires `r!.status` at line 368 because `let r: StepResult` is declared without initialization and TypeScript cannot prove the loop body executes at least once. The assertion is safe — `while(true)` always runs the body — but it signals a type-narrowing gap that will confuse future readers editing that section.

Fix: initialize `r` to a typed sentinel before the loop (`let r: StepResult = { status: "failed", exitCode: -1, stdout: "", stderr: "" }`) and drop the `!`. The sentinel is unreachable by construction but satisfies TypeScript without widening the type.

One-line change in `src/engine/run-cycle.ts`, no design decision.
