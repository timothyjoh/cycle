`★ Insight ─────────────────────────────────────`
Pattern is identical across codex/auggie/opencode: new `exec-<agent>.ts`, register in REGISTRY, widen `Step.agent` union, unit tests for flag combinations, doc updates. `pi` CLI is next in the fleet.
`─────────────────────────────────────────────────`

```markdown
# SPEC — Cycle 0195: Add `pi` CLI as a First-Class Agent Option in Workflow Step YAML

## Objective
Promote `pi` to a first-class agent in the cycle engine, following the identical pattern used for `codex` (cycle 0192), `auggie` (cycle 0193), and `opencode` (cycle 0194). After this cycle, workflow YAML files can specify `agent: pi` in any step without triggering a type error or `UnknownAgentError` at runtime. The optional `model` and `thinking` step fields will be forwarded as CLI flags when present, consistent with the existing codex/auggie/opencode pattern.

## Source Issue
`txt-pi-agent-workflow-step-support` — "Add `pi` CLI as a first-class agent option in workflow step YAML (with optional model and thinking level)"

## Scope

### In Scope
- `src/engine/exec-pi.ts` — new ExecModule implementing `runStep`, forwarding `--model` and `--thinking` when present
- Register `pi` in the `REGISTRY` in `src/engine/exec.ts`
- Widen `Step.agent` in `src/engine/workflow.ts` to include `"pi"`
- Unit tests: flag forwarding combinations and `loadConfig` acceptance
- Documentation updates: CLAUDE.md and ARCHITECTURE.md

### Out of Scope
- Verifying pi flag names against a live `pi --help` (document as TODO in code if flags are unconfirmed)
- Any changes to gemini, auggie, codex, opencode, or claudecode exec modules
- Changes to workflow prompt files or agent registry lookup logic

## Requirements
- `exec-pi.ts` must implement `ExecModule` with `promptDelivery: "stdin"` (same as codex/auggie/opencode)
- `model` field, when present, must be forwarded as `--model <value>`
- `thinking` field, when present, must be forwarded as `--thinking <value>`
- Neither flag may appear in argv when the fields are absent
- `Step.agent` union must include `"pi"` — `loadConfig` must accept it without throwing
- Existing agents (`claudecode`, `bash`, `codex`, `gemini`, `auggie`, `opencode`) must be unaffected

## Acceptance Criteria
- [ ] `src/engine/exec-pi.ts` exists and implements `ExecModule`
- [ ] `pi` registered in `REGISTRY` in `src/engine/exec.ts`
- [ ] `Step.agent` union in `src/engine/workflow.ts` includes `"pi"`
- [ ] `--model <value>` forwarded when `model` is set on a pi step
- [ ] `--thinking <value>` forwarded when `thinking` is set on a pi step
- [ ] Neither flag appears in argv when the fields are absent
- [ ] Unit test: `loadConfig` accepts a step with `agent: "pi"` without throwing
- [ ] All existing tests still pass
- [ ] Coverage does not decrease vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean)

## Testing Strategy
- Framework: Node built-in test runner (same as rest of suite)
- New test file: `tests/exec-pi.test.ts`
  - No model/thinking: argv is `[]`
  - Model only: argv is `["--model", "<value>"]`
  - Thinking only: argv is `["--thinking", "<value>"]`
  - Both present: correct combined argv
- Workflow parsing test: step with `agent: "pi"` passes `loadConfig` without error
- `npm test` must pass with no regressions

## Documentation Updates
- **CLAUDE.md**: Update the registered step agents line to include `pi` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags)
- **docs/ARCHITECTURE.md**: Add `pi` to the agent registry table alongside `codex`, `gemini`, `auggie`, and `opencode`
- **README.md**: No user-facing change required

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/exec-spawn.ts` — `runAgent` helper (already exists)
- `src/engine/exec.ts` — `ExecModule` interface already includes `model?` and `thinking?` (landed in cycle 0192)
- `pi` binary must be on PATH at workflow execution time (runtime concern, not a build concern)
```
