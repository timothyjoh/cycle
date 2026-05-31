# Supported agent models

> These model IDs are a **snapshot, accurate as of 2026-05**. Model IDs drift
> fast. An enumerated list is a snapshot, not a contract — **the discovery
> command is the durable source of truth.** Verify any ID against the agent's
> live CLI before relying on it.

This is the user-facing reference for which `model` strings each supported
agent's `--model` flag accepts, plus how to set a model in `workflows.yml` and
how to discover each agent's live model list.

## Setting a model

A model is set per step, or for every step at once via the top-level
`defaults` block (added in `feat-workflow-defaults-agent-model`). A step may
override any default field. For the canonical syntax and resolution rules see
[`docs/workflows.md#top-level-defaults`](workflows.md#top-level-defaults); a
copy-pasteable starting point is shipped as
[`src/defaults/models.example.yml`](../src/defaults/models.example.yml)
(synced to `.cycle/models.example.yml`).

```yaml
defaults:
  agent: claudecode      # default agent for all steps
  model: opus            # claudecode alias; see the table below

workflows:
  feature:
    steps:
      - { name: spec,  prompt: prompts/spec.md }                  # inherits claudecode + opus
      - { name: build, prompt: prompts/build.md, model: sonnet }  # per-step model override
```

Per-field resolution is `effective X = step.X ?? defaults.X`; bash steps ignore
`model`/`thinking`.

## Per-agent model reference

| Agent | `--model` format | Known-good examples | Discover live list | `thinking` |
|---|---|---|---|---|
| **claudecode** (`claude`) | alias or full ID | `opus`, `sonnet`, `haiku`; `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | `/model` in-session; Anthropic model docs | no `--thinking` |
| **codex** (`codex`) | model ID (`--model`/`-m`) | `gpt-5.5` (default), `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.2-codex` | OpenAI Codex models docs; older `gpt-5-codex` IDs are stale | `--thinking` supported |
| **gemini** (`gemini`) | model ID (`--model`/`-m`) | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3-pro`, `gemini-3-flash` | `/model` in-session; Gemini CLI docs | no flag |
| **auggie** (`auggie`) | short name | `sonnet4.5`, `haiku4.5`, `gpt5` (default has been `gpt-5.4`) | `auggie --list-models` / `auggie models list` | no `--thinking` flag |
| **opencode** (`opencode`) | `provider/model_id` | `anthropic/claude-sonnet-4-…`, `google/gemini-2.5-pro`, `openai/gpt-5.5`, `opencode/grok-code` | `opencode models` | `--thinking` (assumed; verify) |
| **pi** (`pi`) | provider/model via config | configured in `~/.pi/agent/models.json`; switch with `/model` | `/model` in-session; pi docs | flag mapping assumed (see TODO in `exec-pi.ts`) |

- **opencode — open-ended, not enumerable.** Documented by format + discovery
  only; do not freeze a model list here.
- **pi — open-ended, not enumerable.** Documented by format + discovery only;
  do not freeze a model list here.

## thinking-flag support

- **claudecode** — `thinking` is silently ignored (no `--thinking` flag).
- **gemini** — `thinking` is silently ignored (no `--thinking` flag).
- **auggie** — `thinking` is silently ignored (no `--thinking` flag).
- **codex** — `--thinking` supported.
- **opencode** — `--thinking` mapping is **assumed/TODO**; verify against
  `opencode --help` before relying on it (see `src/engine/exec-opencode.ts`).
- **pi** — `--thinking` mapping is **assumed/TODO**; verify against `pi --help`
  before relying on it (see `src/engine/exec-pi.ts`).

## Adding a new agent — model contract

*(maintainer-facing — extends the agent-fleet consistency note in
[`CLAUDE.md`](../CLAUDE.md).)*

An enumerated list is a snapshot, not a contract; the discovery command is the
durable source of truth. Open-ended agents (pi, opencode) are documented by
*format + discovery only*, never by a frozen list.

Whoever adds an agent must answer, in this file, all five rows:

1. **Model-set shape** — Enumerable (claudecode/codex/gemini/auggie) vs
   open-ended / provider-namespaced (opencode `anthropic/…`, pi
   `~/.pi/agent/models.json`). Do not enumerate open-ended sets.
2. **`--model` forwarding** — how the agent's `exec-*.ts` maps `step.model` →
   argv (flag name, position); mark unverified flag names TODO (opencode/pi
   precedent).
3. **`thinking` support** — whether a `--thinking` (or equivalent) flag exists;
   if not, state `thinking` is silently ignored (auggie precedent).
4. **Default model** — what the agent uses when no `--model` is passed.
5. **Discovery command** — `auggie models list` / `opencode models` /
   in-session `/model` / vendor docs URL.

Documenting the model contract is in addition to the three other touch-points a
new agent already requires (per the `CLAUDE.md` note): the `REGISTRY` in
`exec.ts`, the `Step.agent` union in `workflow.ts`, and the agent's `exec-*.ts`
module.

## Sources

- Claude Code CLI reference — code.claude.com/docs
- OpenAI Codex models — developers.openai.com/codex/models
- Gemini CLI docs — geminicli.com
- OpenCode models — opencode.ai/docs/models
- Augment CLI reference — docs.augmentcode.com/cli
- pi — pi.dev, github.com/badlogic/pi-mono

> `opencode` and `pi` `--model`/`--thinking` flag names are still marked
> assumed/TODO in `src/engine/exec-opencode.ts` and `exec-pi.ts`. Verify against
> `opencode --help` / `pi --help` before presenting them as authoritative.
