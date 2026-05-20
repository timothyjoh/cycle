# SPEC — Cycle 0194: Add `opencode` CLI as a First-Class Agent Option in Workflow Step YAML

## Objective
Promote `opencode` to a first-class agent in the cycle engine, following the identical pattern used for `codex` (cycle 0192) and `auggie` (cycle 0193). After this cycle, workflow YAML files can specify `agent: opencode` in any step without triggering a type error or `UnknownAgentError` at runtime. The optional `model` and `thinking` step fields will be forwarded as CLI flags when present, consistent with the existing codex/auggie pattern.

## Source Issue
`txt-opencode-agent-workflow-step-support` — "Add `opencode` CLI as a first-class agent option in workflow step YAML (with optional model and thinking level)"

## Scope

### In Scope
- `src/engine/exec-opencode.ts` — new ExecModule implementing `runStep`, forwarding `--model` and `--thinking` when present
- Register `opencode` in the `REGISTRY` in `src/engine/exec.ts`
- Widen `Step.agent` in `src/engine/workflow.ts` to include `"opencode"`
- Unit tests: flag forwarding combinations and `loadConfig` acceptance
- Documentation updates: CLAUDE.md and ARCHITECTURE.md

### Out of Scope
- Verifying opencode flag names against a live `opencode --help` (document as TODO in code if flags are unconfirmed)
- Any changes to gemini, auggie, codex, or claudecode exec modules
- Changes to workflow prompt files or agent registry lookup logic

## Requirements
- `exec-opencode.ts` must implement `ExecModule` with `promptDelivery: "stdin"` (same as codex/auggie)
- `model` field, when present, must be forwarded as `--model <value>`
- `thinking` field, when present, must be forwarded as `--thinking <value>`
- Neither flag may appear in argv when the fields are absent
- `Step.agent` union must include `"opencode"` — `loadConfig` must accept it without throwing
- Existing agents (`claudecode`, `bash`, `codex`, `gemini`, `auggie`) must be unaffected

## Acceptance Criteria
- [ ] `src/engine/exec-opencode.ts` exists and implements `ExecModule`
- [ ] `opencode` registered in `REGISTRY` in `src/engine/exec.ts`
- [ ] `Step.agent` union in `src/engine/workflow.ts` includes `"opencode"`
- [ ] `--model <value>` forwarded when `model` is set on an opencode step
- [ ] `--thinking <value>` forwarded when `thinking` is set on an opencode step
- [ ] Neither flag appears in argv when the fields are absent
- [ ] Unit test: `loadConfig` accepts a step with `agent: "opencode"` without throwing
- [ ] All existing tests still pass
- [ ] Coverage does not decrease vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean)

## Testing Strategy
- Framework: Node built-in test runner (same as rest of suite)
- New test file: `tests/exec-opencode.test.ts`
  - No model/thinking: argv is `[]`
  - Model only: argv is `["--model", "<value>"]`
  - Thinking only: argv is `["--thinking", "<value>"]`
  - Both present: correct combined argv
- Workflow parsing test: step with `agent: "opencode"` passes `loadConfig` without error
- `npm test` must pass with no regressions

## Documentation Updates
- **CLAUDE.md**: Update the registered step agents line to include `opencode` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags)
- **docs/ARCHITECTURE.md**: Add `opencode` to the agent registry table alongside `codex`, `gemini`, and `auggie`
- **README.md**: No user-facing change required

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/exec-spawn.ts` — `runAgent` helper (already exists)
- `src/engine/exec.ts` — `ExecModule` interface already includes `model?` and `thinking?` (landed in cycle 0192)
- `opencode` binary must be on PATH at workflow execution time (runtime concern, not a build concern)
