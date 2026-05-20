`★ Insight ─────────────────────────────────────`
The `Step` type currently omits `codex` from the agent union despite it being registered in the runtime dispatch table — a type/runtime gap. Adding `model` and `thinking` as top-level Step fields is the right design since sibling issues (auggie, opencode, pi) will all depend on this pattern.
`─────────────────────────────────────────────────`

```
# SPEC — Cycle 0192: Add `codex` as a First-Class Agent Option

## Objective
Promote `codex` from a runtime-only dispatch entry to a fully typed,
first-class workflow step agent. Today `agent: codex` works at runtime but
TypeScript rejects it because the `Step` type only admits `"claudecode" |
"bash"`. Beyond type correctness, workflow authors need per-step control over
the codex model and thinking level — two codex-specific options with no
analogue in claudecode or bash. This cycle adds those capabilities so a
workflow step can be written as:

  - { name: build, agent: codex, model: o4-mini, thinking: medium,
      prompt: prompts/build.md }

and have both the type system and the runtime honour it.

## Source Issue
`txt-codex-agent-workflow-step-support` — "Add `codex` as a first-class agent
option in workflow step YAML (with optional model and thinking level)"

## Scope

### In Scope
- Add `"codex"` to the `agent` union in the `Step` type (`src/engine/workflow.ts`).
- Add optional `model?: string` and `thinking?: string` fields to the `Step` type.
- Extend `ExecModule.runStep()` args to accept and forward `model` and `thinking`.
- Update `exec-codex.ts` to translate those fields into codex CLI argv flags.
- Update `run-cycle.ts` to pass `step.model` and `step.thinking` into `runStep()`.
- Tests: new scenarios covering model-flag and thinking-flag propagation in codex spawn.

### Out of Scope
- Any other agent (auggie, opencode, pi) — each gets its own cycle.
- Changes to the claudecode or gemini exec modules.
- Validating that the user-supplied model name is a known codex model.
- UI or TUI changes.

## Requirements
- `Step.agent` must accept `"codex"` without a TypeScript error.
- `Step.model` (optional string) and `Step.thinking` (optional string) are
  parsed from workflows.yml and carried through to the exec layer.
- When `model` is present, codex is spawned with `--model <value>` prepended to
  its argv.
- When `thinking` is present, codex is spawned with `--thinking <value>`
  prepended to its argv (after `--model` if both are set).
- When neither is present, codex behaves exactly as it does today (no argv
  change, no regression).
- `claudecode`, `gemini`, and `bash` exec paths must not be affected by the
  new fields.
- Coverage must not decrease from master baseline (Line ≥ 95%, Branch ≥ 75%,
  Function ≥ 90%).

## Acceptance Criteria
- [ ] `Step` type includes `"codex"` in the agent union.
- [ ] `Step` type includes `model?: string` and `thinking?: string`.
- [ ] `ExecModule.runStep()` accepts optional `model` and `thinking`.
- [ ] `exec-codex.ts` passes `--model <model>` when `model` is set.
- [ ] `exec-codex.ts` passes `--thinking <thinking>` when `thinking` is set.
- [ ] Both flags together: argv is `["--model", "<m>", "--thinking", "<t>"]`.
- [ ] Neither flag: argv is `[]` (no regression from current behaviour).
- [ ] `run-cycle.ts` forwards `step.model` and `step.thinking` to `runStep()`.
- [ ] New tests cover: model-only, thinking-only, both, neither.
- [ ] All existing tests still pass (531 tests, 0 failures).
- [ ] `npm run typecheck` passes with no errors.
- [ ] Coverage gates pass (`npm run check:coverage`).
- [ ] `npm run check:invariants` passes.

## Testing Strategy
- Framework: Node built-in `node:test` (existing pattern).
- Add tests to `tests/engine/exec-codex.test.ts`:
  - Happy path with `--model o4-mini` in argv (fake codex echoes args to
    stdout; assert `--model` and `o4-mini` present).
  - Happy path with `--thinking high` in argv.
  - Happy path with both flags; assert order: model before thinking.
  - Existing tests (no model/no thinking) remain and must still pass.
- Update `tests/engine/workflow.test.ts`: add a test parsing a step with
  `agent: codex`, `model: o4-mini`, `thinking: medium`; assert all three
  fields round-trip correctly.
- No E2E tests required (no UI change; CLI integration covered by existing
  run-cycle agent-dispatch tests).

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No command changes; update architecture bullet
  listing registered agents to note `codex` is first-class with optional
  `model` and `thinking` fields.
- **docs/ARCHITECTURE.md**: Update the Step fields table to add `model` and
  `thinking` rows.
- **docs/ENGINE.md**: Update the agent dispatch note to reflect the new
  optional fields and how codex argv is built.
- **`.cycle/workflows.yml`** (defaults): No change required — existing steps
  continue to work; new fields are opt-in.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/exec-codex.ts`, `src/engine/exec.ts`, `src/engine/exec-spawn.ts`,
  `src/engine/workflow.ts`, `src/engine/run-cycle.ts` — all present on master.
- No external services or env vars required.
- Node ≥ 22.6 (project requirement; no change).
```
