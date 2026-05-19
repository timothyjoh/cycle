Good. Now I have all context needed.

# SPEC — Cycle 0165: Cover Non-claudecode Agent Dispatch Through workflow.ts

## Objective
Add integration tests that exercise `run-cycle.ts` dispatch through `resolveAgent` for both `codex` and `gemini` agents. Today, every `runCycle` end-to-end test uses `agent: claudecode` or `agent: bash`, so a regression in the workflow-layer dispatch path for other agents (wrong prompt threading, env propagation, cwd handling) would ship green. This cycle closes that gap by running fake-binary-backed one-step workflows through `runCycle` with `agent: codex` and `agent: gemini`, asserting that `step.end status:ok` lands in `log.jsonl`.

## Source Issue
`refl-0031-workflow-agent-dispatch-only-end-to-end` — "Cover non-claudecode agent dispatch through workflow.ts with end-to-end test"

## Scope

### In Scope
- New test file `tests/engine/run-cycle.agent-dispatch.test.ts` with two tests: one for `agent: codex`, one for `agent: gemini`, each using the fake-binary-on-PATH pattern from `exec-codex.test.ts` / `exec-gemini.test.ts` but routed through `runCycle`
- Each test asserts `step.end status:ok` in `log.jsonl` and that the fake binary was invoked (stdout round-trip confirms execution path)

### Out of Scope
- Flipping any real shipped workflow step to `agent: codex` / `agent: gemini`
- Reworking the `ExecModule.promptPath` contract (tracked under `refl-0029`)
- Extracting further shared helpers beyond what cycle 0162 already delivered
- Testing `UnknownAgentError` dispatch (already covered in `exec.test.ts`)

## Requirements
- Tests must use `runCycle` (not `resolveAgent(...).runStep` directly) — the integration seam being tested is `workflow.ts` → `run-cycle.ts` → `resolveAgent`
- Fake binary must be placed on PATH via the prepended-PATH shim pattern already used in `run-cycle.test.ts`
- Tests must assert `step.end status:ok` in `log.jsonl` (not just `r.status === "ok"`) to verify the event reaches the log
- Tests must use `mode: trunk` / `push: false` to avoid git remote interactions
- Git repo initialization (init, config, empty commit) is required by `runCycle`
- `codex` fake binary: reads stdin and echoes it (prompt delivered via stdin); `gemini` fake binary: accepts prompt as last argv and echoes it (prompt delivered via argv) — matching each module's actual delivery contract

## Acceptance Criteria
- [ ] `tests/engine/run-cycle.agent-dispatch.test.ts` exists with at least two tests
- [ ] Test "runCycle dispatches agent:codex through resolveAgent, step.end status:ok" passes
- [ ] Test "runCycle dispatches agent:gemini through resolveAgent, step.end status:ok" passes
- [ ] Each test asserts `/"event":"step\.end".*"step":"build".*"status":"ok"/` (or equivalent named step) in `log.jsonl`
- [ ] Tests would fail if `run-cycle.ts` line 211 (`resolveAgent`) were replaced with a hardcoded `claudecodeExec` call
- [ ] All existing tests still pass (`npm test`)
- [ ] `src/engine/workflow.ts` branch coverage non-regressing vs master baseline
- [ ] No compiler/linter warnings (`npm run typecheck`)

## Testing Strategy
- Framework: Node.js built-in `node:test` — matches every other test file in the repo
- Test file: `tests/engine/run-cycle.agent-dispatch.test.ts`
- Pattern: copy the `workflowYml()` helper pattern from `run-cycle.test.ts` for config scaffolding
- Codex happy path: fake `codex` binary at `#!/bin/bash\ncat\n` (reads stdin, echoes prompt body → stdout `ok`)
- Gemini happy path: fake `gemini` binary at `#!/bin/bash\necho "$@"\n` (echoes argv → stdout contains prompt body)
- Both tests: init git repo, write single-step workflow with the target agent, invoke `runCycle`, read `log.jsonl`, assert `step.end status:ok`
- No E2E UI tests required (no UI changes)

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes required
- **README.md**: No user-facing changes

## Dependencies
- `src/engine/exec-spawn.ts` (cycle 0162) — must already exist; provides `runAgent` used by codex/gemini modules
- `src/engine/exec.ts` REGISTRY — must include `codex` and `gemini` keys (already true after cycle 0031/0162)
- `src/engine/run-cycle.ts` dispatch at lines 207–212 — the integration seam under test
