# SPEC — Cycle 0006: Top-Level `defaults.{agent,model,thinking}` in workflows.yml with Per-Step Override

## Objective
Operators currently must repeat `agent: claudecode` on every step in `.cycle/workflows.yml` and have no way to set a run-wide default model or thinking level — driving a whole workflow with a different agent or model means hand-editing every step. This cycle introduces an optional top-level `defaults:` block (`agent`, `model`, `thinking`) that is resolved into every step at config-load time, with any step-level field overriding the default. Resolution happens inside `loadConfig`, so the rest of the engine (`run-cycle.ts`) continues to read concrete `step.agent` / `step.model` / `step.thinking` values with no changes. This makes per-run agent/model selection a one-line config edit while preserving full back-compat with existing explicit-agent configs.

## Source Issue
`feat-workflow-defaults-agent-model` — "Add top-level defaults.{agent,model,thinking} to workflows.yml with per-step override"

## Scope

### In Scope
- Add an optional `Defaults` type and `defaults?: Defaults` field to `CycleConfig` in `src/engine/workflow.ts`, and resolve defaults into every returned `Step` at load time in `loadConfig` (including agent-validation and the missing-agent error path).
- Update `src/defaults/workflows.yml` to use a `defaults: { agent: claudecode }` block, drop now-redundant `agent: claudecode` from inheriting steps (keeping explicit `agent: bash` on command steps), and run `npm run sync-defaults` so `.cycle/workflows.yml` matches.
- Add unit tests covering inheritance, per-step override, bash-step protection, the missing-agent error, and back-compat for configs with no `defaults:` block.

### Out of Scope
- Making `--model` actually reach `claudecode`/`gemini` argv (sibling issue `feat-agent-model-forwarding`). This cycle only resolves config values; it does not change agent forwarding.
- Documenting which model strings each agent accepts (tracked in `docs-supported-models-reference`).
- Any change to `run-cycle.ts` step-execution logic or to the `exec-*.ts` provider modules.

## Requirements
- `loadConfig` accepts an optional top-level `defaults` object with optional `agent`, `model`, and `thinking` string fields.
- For each step in each workflow, `loadConfig` resolves: effective agent = `step.agent ?? defaults.agent`; effective model = `step.model ?? defaults.model`; effective thinking = `step.thinking ?? defaults.thinking`. Every returned `Step` carries a concrete `agent`; `model`/`thinking` are populated only when a step or default supplies them.
- **bash steps are never coerced**: a step is treated as a bash step only when it explicitly declares `agent: bash`. `defaults.agent` of `claudecode` must NOT convert a `command`/`bash` step into an agent step. Resolved `model`/`thinking` on a bash step are inert — `execBashStep` does not consume them; no behavior change.
- Agent validation: the resolved `defaults.agent` and any explicit `step.agent` must be a known agent. The valid set is the `exec.ts` REGISTRY key set (`claudecode|codex|gemini|auggie|opencode|pi`) plus `bash` (dispatched outside the registry). Derive/borrow this set from the registry rather than re-hand-coding the union per the fleet-consistency caveat in CLAUDE.md; an unknown agent (default or step) throws a descriptive malformed-config error naming the workflow and step.
- `defaults` is optional: existing configs with no `defaults:` block and an explicit `agent` on every step load identically (back-compat).
- This change does not alter thinking forwarding — agents whose CLI has no thinking flag continue to silently ignore a resolved `thinking` value, exactly as today.
- **Failure behavior**: On a step with neither `step.agent` nor a `defaults.agent`, `loadConfig` throws a malformed-config `Error` that names the workflow and the offending step, and returns no config (state unchanged — load fails). On a `defaults.agent` or `step.agent` that is not a known agent, `loadConfig` throws a malformed-config `Error` naming the workflow, step, and the rejected agent value. On a `defaults` value that is present but not an object, `loadConfig` throws a malformed-config `Error`. All errors are raised (never swallowed); existing `workflows.yml malformed:` error-message style and the `(${path})` suffix are preserved.

## Acceptance Criteria
- [ ] `workflows.yml` supports an optional top-level `defaults: { agent, model, thinking }`; `loadConfig` returns a `CycleConfig` whose every `Step` has a concrete `agent`.
- [ ] A step with no `agent`/`model`/`thinking` inherits all three from `defaults`; a step that sets any of those fields overrides only that field (verified per-field).
- [ ] A step declaring `agent: bash` is never reassigned to `defaults.agent`, and the loaded step retains `agent: "bash"` even when `defaults.agent: claudecode` is set.
- [ ] A step with neither `step.agent` nor `defaults.agent` causes `loadConfig` to throw an `Error` whose message names the workflow and the step.
- [ ] An unknown resolved agent (in `defaults.agent` or `step.agent`) causes `loadConfig` to throw an `Error` naming the workflow, step, and rejected agent value.
- [ ] A config with no `defaults:` block and an explicit `agent` on every step loads identically to current behavior (back-compat test asserts resolved steps equal the input agents).
- [ ] `src/defaults/workflows.yml` uses the new `defaults:` block, command steps keep explicit `agent: bash`, `npm run sync-defaults` has been run, and `.cycle/workflows.yml` matches `src/defaults/workflows.yml` byte-for-byte.
- [ ] `npm run typecheck` is clean, `npm test` passes, and coverage does not decrease vs the master baseline.

## Testing Strategy
- Test framework: existing `node --test` suite (`--experimental-strip-types`), with new cases in `tests/engine/` covering `loadConfig` resolution.
- Key scenarios:
  - Happy path: a `defaults` block with all three fields; assert each step's resolved `agent`/`model`/`thinking`.
  - Override: per-field step overrides of `agent`, `model`, and `thinking` independently.
  - bash protection: `agent: bash` command step under `defaults.agent: claudecode` stays bash; resolved `model`/`thinking` are inert.
  - Failure paths: missing agent (no step agent, no default) throws naming workflow+step; unknown `defaults.agent` and unknown `step.agent` each throw naming the rejected value; malformed `defaults` (non-object) throws.
  - Back-compat regression: a fixture config with no `defaults:` and explicit per-step agents loads with identical resolved agents.
- Use temp-directory fixtures written to `.cycle/workflows.yml` (or `loadConfig`'s read path) per existing `loadConfig` test patterns; assert on thrown `Error` messages by substring (workflow name, step name, rejected value).
- No UI changes — no E2E/Playwright tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Add a note under the workflow/architecture section documenting the optional top-level `defaults:` block and the `step.X ?? defaults.X` resolution semantics (agent/model/thinking), including that bash steps require explicit `agent: bash` and ignore default model/thinking. Reinforce that the valid-agent set is derived from the `exec.ts` REGISTRY (plus `bash`).
- **README.md**: If `workflows.yml` configuration is surfaced to users, add a short example of the `defaults:` block; otherwise note that no user-facing README change is required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/workflow.ts` (`loadConfig`, `Step`, `CycleConfig`) and the agent registry key set in `src/engine/exec.ts` (`REGISTRY`) must exist — both present.
- `src/defaults/workflows.yml`, the `npm run sync-defaults` script, and the `.cycle/workflows.yml` sync check must exist — present.
- No external services or env vars required. Resolution is independent of `CYCLE_TRUNK_BASED` and the existing commit-config handling in `loadConfig`.
