---
id: feat-agent-model-forwarding
title: "Forward --model to claudecode and gemini exec modules"
workflow: feature
depends_on: []
triaged_at: "2026-05-30T09:15:00.000Z"
source: user
priority: medium
---
## Problem

The `model` step field is plumbed through `run-cycle.ts` into `mod.runStep({ model })`,
but two exec modules silently drop it:

- `src/engine/exec-claudecode.ts` builds argv as
  `["--dangerously-skip-permissions", "--append-system-prompt"?, "-p"]` and
  **never appends `--model`**. Setting `model:` on a claudecode step has no effect.
- `src/engine/exec-gemini.ts` calls `runAgent({ binary: "gemini", argv: [] })` and
  **ignores `model` entirely** — it does not even destructure it.

`codex`, `auggie`, `opencode`, and `pi` already forward `--model`. So per-step
model selection is broken for the two most-used agents. This blocks the
`defaults.{agent,model}` feature from being end-to-end useful.

## Fix

### claudecode (`src/engine/exec-claudecode.ts`)
Destructure `model` and append `--model <model>` to argv when set. The `claude`
CLI accepts `--model` with either aliases (`opus`, `sonnet`, `haiku`) or full IDs
(`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). Place the
flag before `-p` (consistent with `--append-system-prompt` ordering). `thinking`
remains unsupported for claudecode — do not add a `--thinking` flag.

### gemini (`src/engine/exec-gemini.ts`)
Destructure `model` and pass `--model <model>` when set (the `gemini` CLI accepts
`--model`/`-m`, e.g. `gemini-2.5-pro`, `gemini-2.5-flash`). `thinking` has no
gemini flag — leave it unforwarded, matching the auggie precedent.

## Tests

- `tests/engine/exec-claudecode.test.ts` (and gemini equivalent): assert that when
  `model` is provided, argv contains `--model <value>`; when omitted, argv does NOT
  contain `--model`. Mirror the existing argv-assertion style used by the codex/auggie
  exec tests (which already cover `--model` presence/absence).
- Confirm `--model` ordering for claudecode keeps `-p` last (prompt delivery via argv).

## Acceptance criteria

- [ ] `exec-claudecode` appends `--model <model>` when `model` is set; nothing when unset.
- [ ] `exec-gemini` forwards `--model <model>` when set; nothing when unset.
- [ ] No `--thinking` added for either agent (neither CLI supports it here).
- [ ] Tests cover present/absent `--model` for both modules.
- [ ] `npm run typecheck` clean; `npm test` passes; coverage does not decrease.

## Notes

- Update the per-agent `--model` support notes in `docs/ENGINE.md` /
  `src/engine/exec.ts` doc comments if they claim or imply gemini/claudecode model
  handling that no longer matches.
