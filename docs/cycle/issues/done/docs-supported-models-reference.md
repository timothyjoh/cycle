---
id: docs-supported-models-reference
title: "Add a supported-models reference/example file for cycle users"
workflow: document
depends_on: [feat-workflow-defaults-agent-model, feat-agent-model-forwarding]
triaged_at: "2026-05-30T09:15:00.000Z"
source: user
priority: medium
---
## Problem

Once `defaults.{agent,model}` and per-step model overrides exist, cycle users need
to know which model strings each supported agent's `--model` flag actually accepts.
There is no reference today, and model IDs drift fast — users will otherwise
copy stale IDs from blog posts.

## Task

Create a user-facing reference file — propose `docs/models.md` (linked from
`CLAUDE.md` and `README`/`BRIEF.md`), plus a copy-pasteable
`src/defaults/models.example.yml` showing the `defaults:` block and per-step
overrides. If adding to `src/defaults/`, wire it into `npm run sync-defaults` so it
lands in `.cycle/`.

The doc must:
1. Show the `defaults: { agent, model }` syntax and a per-step override example
   (cross-reference `feat-workflow-defaults-agent-model`).
2. For each agent, give the `--model` value format, a few known-good examples, and
   **how to discover the live list** (model IDs change — the discovery command is the
   durable part).
3. Note thinking-flag support per agent (claudecode/gemini/auggie: no `--thinking`).
4. Carry a "verify against the live CLI; these IDs are accurate as of 2026-05" caveat.

## Second deliverable: "Adding a new agent — model contract" (maintainer-facing)

The model IDs above will rot; the *contract for documenting a new agent's models*
will not. Add a maintainer-facing section (in `docs/ENGINE.md`, or a dedicated
`docs/adding-an-agent.md` linked from `CLAUDE.md`) that **extends** the existing
agent-fleet consistency note in `CLAUDE.md` (REGISTRY in `exec.ts`, the `Step.agent`
union in `workflow.ts`, the `exec-*.ts` module) with the model dimension. Whoever
adds an agent must answer, in the models reference, every row of:

1. **Model-set shape** — classify the agent as one of:
   - **Enumerable** — a fixed, listable set of first-party model IDs/aliases
     (e.g. claudecode, codex, gemini, auggie). Document the known-good values.
   - **Open-ended / provider-namespaced** — effectively unbounded; the model is a
     `provider/model` string or fully user-configurable (e.g. opencode's
     `anthropic/…`, pi's `~/.pi/agent/models.json`). **Do NOT attempt to enumerate
     these** — document the format + the discovery command and stop.
2. **`--model` forwarding** — how the agent's `exec-*.ts` maps the step `model` field
   to argv (flag name, position). If the flag name is unverified, mark it TODO
   (as opencode/pi currently are) rather than implying it is authoritative.
3. **`thinking` support** — does the CLI have a `--thinking` (or equivalent) flag? If
   not, state that `thinking` is silently ignored (auggie precedent).
4. **Default model** — what model the agent uses when no `--model` is passed, so an
   operator knows what they get by omitting it.
5. **Discovery command** — the command that lists the live model set
   (`auggie models list`, `opencode models`, in-session `/model`, vendor docs URL).

State the rule plainly: an enumerated list is a snapshot, not a contract — the
discovery command is the durable source of truth, and open-ended agents like pi /
opencode are documented by *format + discovery only*, never by a frozen list.

## Ground-truth research (as of 2026-05-30 — verify before publishing)

| Agent | `--model` format | Known-good examples | Discover live list | thinking |
|---|---|---|---|---|
| **claudecode** (`claude`) | alias or full ID | `opus`, `sonnet`, `haiku`; `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` | `/model` in-session; Anthropic model docs | no `--thinking` |
| **codex** (`codex`) | model ID (`--model`/`-m`) | `gpt-5.5` (default), `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.2-codex` | OpenAI Codex models docs; older `gpt-5-codex` IDs are stale | `--thinking` supported |
| **gemini** (`gemini`) | model ID (`--model`/`-m`) | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3-pro`, `gemini-3-flash` | `/model` in-session; Gemini CLI docs | no flag |
| **auggie** (`auggie`) | short name | `sonnet4.5`, `haiku4.5`, `gpt5` (default has been `gpt-5.4`) | `auggie --list-models` / `auggie models list` | no `--thinking` flag |
| **opencode** (`opencode`) | `provider/model_id` | `anthropic/claude-sonnet-4-…`, `google/gemini-2.5-pro`, `openai/gpt-5.5`, `opencode/grok-code` | `opencode models` | `--thinking` (assumed; verify) |
| **pi** (`pi`) | provider/model via config | configured in `~/.pi/agent/models.json`; switch with `/model` | `/model` in-session; pi docs | flag mapping assumed (see TODO in `exec-pi.ts`) |

Sources: Claude Code CLI reference (code.claude.com/docs); OpenAI Codex models
(developers.openai.com/codex/models); Gemini CLI docs (geminicli.com); OpenCode
models (opencode.ai/docs/models); Augment CLI reference (docs.augmentcode.com/cli);
pi (pi.dev, github.com/badlogic/pi-mono).

> Note: `opencode` and `pi` `--model`/`--thinking` flag names are still marked
> assumed/TODO in `src/engine/exec-opencode.ts` and `exec-pi.ts`. Verify against
> `opencode --help` / `pi --help` before presenting them as authoritative.

## Acceptance criteria

- [ ] A user-facing models reference exists (`docs/models.md` or equivalent) and is linked from `CLAUDE.md`.
- [ ] A copy-pasteable example shows `defaults:` + a per-step override.
- [ ] Each supported agent documents `--model` format, examples, and a live-discovery command.
- [ ] Per-agent thinking-flag support is noted.
- [ ] A maintainer "Adding a new agent — model contract" section exists, extends the CLAUDE.md agent-fleet note, and enumerates the 5 required answers (model-set shape enumerable vs open-ended, `--model` forwarding, thinking support, default model, discovery command).
- [ ] The contract explicitly states open-ended agents (pi, opencode) are documented by format + discovery only, never a frozen list.
- [ ] If added under `src/defaults/`, `npm run sync-defaults` is run and `.cycle/` synced.
- [ ] `npm test` passes (document workflow — no source/test changes expected).
