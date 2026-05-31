---
id: feat-workflow-defaults-agent-model
title: "Add top-level defaults.{agent,model,thinking} to workflows.yml with per-step override"
workflow: feature
depends_on: []
triaged_at: "2026-05-30T09:15:00.000Z"
source: user
priority: medium
---
## Problem

Every step in `.cycle/workflows.yml` repeats `agent: claudecode`, and there is no
way to set a default model for a run. Operators who want to drive a whole
workflow with a different agent/model must edit every single step. There is no
root-level default and no notion of "use this agent/model unless a step says
otherwise".

## Goal

Introduce a top-level `defaults:` block in `workflows.yml` that sets a default
`agent`, `model`, and `thinking` applied to every step in every workflow, with
each step able to override any field.

```yaml
defaults:
  agent: claudecode
  model: opus          # optional
  thinking: high       # optional

workflows:
  - name: feature
    steps:
      - { name: spec,  prompt: prompts/spec.md }                       # inherits agent+model+thinking
      - { name: build, prompt: prompts/build.md, model: sonnet }       # overrides model only
      - { name: review, agent: codex, model: gpt-5.5, thinking: low }  # overrides all three
      - { name: verify, agent: bash, command: scripts/verify.sh }      # bash, model/thinking ignored
```

## Resolution semantics

- Effective agent for a step = `step.agent ?? defaults.agent`.
- Effective model for a step = `step.model ?? defaults.model`.
- Effective thinking for a step = `step.thinking ?? defaults.thinking`.
- **`bash` steps**: `agent: bash` must still be set explicitly per step (a
  `defaults.agent` of `claudecode` must NOT turn a `command` step into an agent
  step). Any default `model`/`thinking` is ignored for bash steps —
  `execBashStep` does not consume them.
- A default `thinking` reaches every agent step via the same path as a per-step
  `thinking` today; agents whose CLI has no thinking flag (claudecode, gemini,
  auggie) continue to silently ignore it. This issue does not change forwarding —
  it only resolves the value. `run-cycle.ts` already emits no warning for ignored
  thinking, so behaviour is unchanged for those agents.
- If a step has neither `agent` nor a `defaults.agent`, `loadConfig` must throw a
  clear malformed-config error naming the workflow and step.
- `defaults` is **optional** — existing configs with no `defaults:` block and an
  explicit `agent` on every step must keep working unchanged (back-compat).

## Implementation notes

- `src/engine/workflow.ts`:
  - Add `Defaults = { agent?: Step["agent"]; model?: string; thinking?: string }`
    and `defaults?: Defaults` to `CycleConfig`.
  - Make `Step.agent` optional in the *raw parsed* shape, but **resolve at load
    time** in `loadConfig`/`loadWorkflow` so every returned `Step` has a concrete
    `agent` (and `model`/`thinking` if a default applies). This keeps
    `run-cycle.ts` unchanged — it continues to read `step.agent` / `step.model` /
    `step.thinking` as today.
  - Validate that the resolved `defaults.agent` (and any `step.agent`) is a known
    agent. Reuse/borrow the registry key set from `src/engine/exec.ts`
    (`claudecode|bash|codex|gemini|auggie|opencode|pi`) rather than duplicating
    the union by hand — the fleet-consistency caveat in CLAUDE.md applies.
- `src/defaults/workflows.yml`: add a `defaults: { agent: claudecode }` block and
  drop the now-redundant `agent: claudecode` from steps that inherit it (keep
  explicit `agent: bash` on verify steps, and any genuinely different agents).
  Run `npm run sync-defaults` and confirm `.cycle/workflows.yml` matches.

## Acceptance criteria

- [ ] `workflows.yml` supports an optional top-level `defaults: { agent, model, thinking }`.
- [ ] Steps inherit `defaults.agent`/`defaults.model`/`defaults.thinking`; a step-level value overrides.
- [ ] `bash` steps are never coerced by `defaults.agent`; default `model`/`thinking` are no-ops for them.
- [ ] Missing agent (no step agent, no default) → descriptive malformed-config error.
- [ ] Configs with no `defaults:` block (every step has explicit `agent`) still load identically (back-compat test).
- [ ] `src/defaults/workflows.yml` uses the new `defaults:` block; `npm run sync-defaults` run and `.cycle/` synced.
- [ ] `npm run typecheck` clean; `npm test` passes; coverage does not decrease.

## Notes

- Sibling issue `feat-agent-model-forwarding` makes `--model` actually reach
  `claudecode` and `gemini` (currently dropped). This issue only wires the config
  surface; the two are independent and can land in either order, but model
  selection is not end-to-end until both land.
- Documentation of which model strings each agent accepts is tracked in
  `docs-supported-models-reference` (depends on this issue).
