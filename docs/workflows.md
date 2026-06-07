# Custom Workflows

Workflows are the repo-specific production recipes that cycle can run after triage turns inbox items into executable `todo/` items.

The default install ships a general `feature` workflow, but a consuming repository can define any workflows it wants in `.cycle/workflows.yml`: `bugfix`, `docs`, `quickfix`, `e2e-tests`, `migration`, `investigation`, or whatever names fit that repo.

## Where workflows live

```txt
.cycle/workflows.yml
```

That file has four top-level sections — `engine`, `triage`, `defaults` (optional), and `workflows`:

```yaml
engine:
  max_consecutive_failures: 2
  base_branch: master

triage:
  agent: claudecode
  prompt: prompts/triage.md
  max_turns: 10

defaults:
  agent: claudecode

workflows:
  - name: feature
    description: Full SDLC pass for a new feature
    max_cycle_attempts: 3
    steps:
      - { name: spec, prompt: prompts/spec.md }       # agent inherited from defaults
      - { name: research, prompt: prompts/research.md }
      - { name: plan, prompt: prompts/plan.md }
      - { name: build, prompt: prompts/build.md }
      - { name: review, prompt: prompts/review.md }
      - { name: fix, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify, agent: bash, command: scripts/verify.sh }
```

Per-step `agent:` is optional once `defaults.agent` is set — each step inherits it unless it declares its own. The `defaults` block itself is optional; see [Top-level `defaults`](#top-level-defaults) below.

The important rule: **the workflow names in `workflows[]` are the allowed operational categories for this repo.** Triage reads the configured list and must choose one of those names for every child work item it creates.

There is no fixed engine-level issue-kind taxonomy. If a repo wants a `bugfix` path, define a `bugfix` workflow. If another repo wants `frontend-bug`, `api-change`, and `copy-only`, define those instead.

## Top-level `defaults`

`workflows.yml` also accepts an optional top-level `defaults: { agent, model, thinking }` block. At config-load time each field is resolved per step as `effective X = step.X ?? defaults.X`, so you can set a run-wide agent (and optional `model`/`thinking`) once and override it on individual steps:

```yaml
defaults:
  agent: claudecode
  model: opus
  thinking: high

workflows:
  - name: feature
    steps:
      - { name: spec, prompt: prompts/spec.md }                 # inherits agent: claudecode
      - { name: build, agent: codex, prompt: prompts/build.md } # overrides to codex
      - { name: verify, agent: bash, command: scripts/verify.sh }
```

One exception: **bash steps must declare `agent: bash` explicitly.** `defaults.agent` never coerces a step into bash, and a bash step ignores any resolved `model`/`thinking`. A step with neither `step.agent` nor `defaults.agent`, or an unknown resolved agent, fails config load. Configs with no `defaults:` block load unchanged.

## How triage uses custom workflows

During triage, cycle sends the configured workflows to the triage prompt context through `.cycle/workflows.yml`. The triage output must include a `workflow` field for each child:

```json
{
  "raw_id": "gh-123",
  "slug": "fix-safari-login-redirect",
  "id": "gh-123-fix-safari-login-redirect",
  "title": "Fix Safari login redirect",
  "workflow": "bugfix",
  "depends_on": [],
  "body": "## Problem\n..."
}
```

The engine validates that `workflow` matches one of the configured names. If triage emits a workflow that is not in `.cycle/workflows.yml`, the triage attempt fails and is retried with validator feedback.

## Example: add a shorter bugfix workflow

Add a new workflow entry:

```yaml
workflows:
  - name: bugfix
    description: Shorter path for scoped bug fixes with clear reproduction steps
    max_cycle_attempts: 3
    steps:
      - { name: spec, agent: claudecode, prompt: prompts/spec.md }
      - { name: build, agent: claudecode, prompt: prompts/build.md }
      - { name: review, agent: claudecode, prompt: prompts/review.md }
      - { name: fix, agent: claudecode, prompt: prompts/fix.md, skip_unless: MUST-FIX.md }
      - { name: verify, agent: bash, command: scripts/verify.sh }
```

Now an inbox item that clearly describes a small bug can be routed by triage to `workflow: bugfix` instead of the default `feature` workflow.

## Example: add a docs-only workflow

```yaml
workflows:
  - name: docs
    description: Documentation-only change path
    max_cycle_attempts: 2
    steps:
      - { name: documentation, agent: claudecode, prompt: prompts/documentation.md }
      - { name: verify, agent: bash, command: scripts/verify.sh }
```

Use this when the expected change should be documentation-only and does not need a full spec/research/plan/build loop.

## Step fields

Each step supports these common fields:

| Field | Meaning |
|---|---|
| `name` | Step name. Also names the artifact where applicable. |
| `agent` | Registered executor: `claudecode`, `codex`, `gemini`, `auggie`, `opencode`, `pi`, or `bash`. |
| `prompt` | Prompt template under `.cycle/prompts/`, for agent steps. |
| `command` | Shell script under `.cycle/`, for `bash` steps. |
| `skip_unless` | Skip this step unless the named artifact exists. Useful for fix steps. |
| `max_cycle_attempts` | Workflow-level retry budget. |

## Forcing a workflow manually

Triage normally chooses the workflow. You can override it for a one-off command:

```sh
./.cycle/bin/cycle.js run --workflow bugfix "fix the Safari login redirect"
```

That is useful when a parent agent or human already knows which production recipe should run.

An unknown or value-less `--workflow` is rejected loud and cheap: `run --workflow <typo>` (or a trailing `--workflow` with no value) prints a one-line stderr message naming the bad value and listing the available workflow names, then exits non-zero **before any issue is marked in-progress** — no attempt is burned and nothing parks in `failed/`. This is the same validation `cycle doctor --workflow` performs (shared via one helper, so the two diagnostics cannot drift).

## Design guidance

Create workflows around operational differences, not labels for their own sake.

Good workflow boundaries:

- different verification commands
- different required artifacts
- shorter/longer review path
- documentation-only vs code-changing work
- investigation that should produce analysis before implementation

Weak workflow boundaries:

- `bug` vs `feature` when both run the exact same steps
- labels that only matter to a tracker, not to cycle execution
- speculative categories no current repo uses

Keep the default path boring. Add custom workflows only when they save real work or prevent real mistakes.
