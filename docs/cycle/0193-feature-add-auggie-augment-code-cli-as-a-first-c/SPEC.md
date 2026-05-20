# SPEC — Cycle 0193: Add `auggie` (Augment Code) as a First-Class Agent Option in Workflow Step YAML

## Objective
Promote `auggie` (Augment Code CLI) to a first-class agent in the cycle engine, following the same pattern as `exec-gemini.ts` and `exec-codex.ts`. After this cycle, workflow YAML files can specify `agent: auggie` in any step without triggering a type error or `UnknownAgentError` at runtime. Because cycle 0192 already landed `model` and `thinking` in the `ExecModule` interface, auggie will also forward those optional fields as CLI flags when present.

## Source Issue
`txt-auggie-agent-workflow-step-support` — "Add `auggie` (Augment Code) CLI as a first-class agent option in workflow step YAML"

## Scope

### In Scope
- `src/engine/exec-auggie.ts` — new ExecModule that calls `auggie` via `runAgent`, forwarding `--model` and `--thinking` when present
- Register `auggie` in the REGISTRY in `src/engine/exec.ts`
- Widen `Step.agent` in `src/engine/workflow.ts` to include `"gemini"` (already registered but missing from the type union) and `"auggie"` (new)
- Unit tests: flag forwarding and config validation

### Out of Scope
- Verifying auggie flag names against a live `auggie --help` (document in code as a TODO if flags are unconfirmed)
- Adding `model`/`thinking` fields to gemini's exec module (gemini does not use them; that is a separate concern)
- Any changes to workflow prompt files or the agent registry lookup logic

## Requirements
- `exec-auggie.ts` must implement `ExecModule` with `promptDelivery: "stdin"` (same as gemini/codex)
- `model` field, when present, must be forwarded as `--model <value>`
- `thinking` field, when present, must be forwarded as `--thinking <value>`
- `Step.agent` union must include `"auggie"` — `loadConfig` must accept it without throwing
- `"gemini"` must also be added to `Step.agent` union (it is in the registry but currently missing from the type, causing a type gap)
- Existing agents (`claudecode`, `bash`, `codex`, `gemini`) must be unaffected

## Acceptance Criteria
- [ ] `src/engine/exec-auggie.ts` exists and implements `ExecModule`
- [ ] `auggie` registered in `REGISTRY` in `src/engine/exec.ts`
- [ ] `Step.agent` includes `"auggie"` and `"gemini"` (corrects pre-existing type gap)
- [ ] `--model <value>` forwarded when `model` is set on an auggie step
- [ ] `--thinking <value>` forwarded when `thinking` is set on an auggie step
- [ ] Neither flag appears in argv when the fields are absent
- [ ] Unit test: `loadConfig` accepts a step with `agent: "auggie"` without throwing
- [ ] All existing tests still pass
- [ ] Coverage does not decrease vs baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%)
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean)

## Testing Strategy
- Framework: Node built-in test runner (same as rest of suite)
- New test file: `tests/exec-auggie.test.ts`
  - Happy path: `runStep` with no model/thinking → argv is `[]`
  - Model only: `runStep({ model: "some-model" })` → argv is `["--model", "some-model"]`
  - Thinking only: `runStep({ thinking: "high" })` → argv is `["--thinking", "high"]`
  - Both present: correct combined argv
- Workflow parsing test in `tests/workflow.test.ts` (or existing suite): step with `agent: "auggie"` passes `loadConfig` validation
- `npm test` must pass with no regressions

## Documentation Updates
- **CLAUDE.md**: Update the registered step agents line to include `auggie` (first-class; optional `model` and `thinking` step fields map to `--model`/`--thinking` argv flags)
- **docs/ARCHITECTURE.md**: Add `auggie` to the agent registry table alongside `codex` and `gemini`
- **README.md**: No user-facing change required (auggie is a workflow-author concern, not end-user CLI)

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/exec-spawn.ts` — `runAgent` helper (already exists)
- `src/engine/exec.ts` — `ExecModule` interface already includes `model?` and `thinking?` (landed in cycle 0192)
- `auggie` binary must be on PATH at workflow execution time (runtime concern, not a build concern)
