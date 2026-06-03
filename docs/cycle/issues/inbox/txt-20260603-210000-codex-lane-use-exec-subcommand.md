---
id: txt-20260603-210000-codex-lane-use-exec-subcommand
source: text
title: "Fix codex lane: use `codex exec` — bare `codex` fails 'stdin is not a terminal' on codex 0.136.0"
added_at: 2026-06-03T21:00:00.000Z
triage_attempts: 0
priority: high
---

## Problem

`src/engine/exec-codex.ts` invokes **bare `codex --model <m> [--thinking <t>]`** with the prompt
piped to stdin (`promptDelivery: "stdin"`). On **codex-cli 0.136.0**, bare `codex` (no subcommand)
is the **interactive** entrypoint and requires a TTY stdin — so a piped prompt fails immediately:

```
$ printf 'Reply OK' | codex --model gpt-5.5
Error: stdin is not a terminal        # exit 1

$ printf 'Reply OK' | codex exec -m gpt-5.5
OK                                     # works
```

Every codex step therefore fails at exit 1. This **broke recon** (codex-based) when it was
upgraded to v0.1.13 — all `spec`/build steps died with `stdin is not a terminal`, halting on
`max_consecutive_failures`. It was reverted to a pre-0.1.13 bin to recover.

**Why it shipped:** the codex tests inject a fake `CYCLE_CODEX_BIN`, so they never exercise the
real `codex` CLI contract — the same fake-agent blind spot that hid the maestro preflight + codex
`--output-schema` bugs.

## Task

- Change `exec-codex.ts` to use the **`exec` subcommand**: argv starts with `"exec"`, then
  `-m/--model <model>` when set, prompt delivered via stdin (verified: `printf … | codex exec -m …`
  reads the piped prompt non-interactively). Keep the `CYCLE_CODEX_BIN` override.
- **Handle `--thinking` carefully:** `codex exec` does **not** accept `--thinking` (its options are
  `-m`, `-c`, `--enable/--disable`, `--output-schema`, `-o`, `--json`, `--color`). Map the
  `thinking` step field to a valid `codex exec` mechanism (e.g. `-c model_reasoning_effort=<low|
  medium|high>`) or drop it — do **not** pass an unknown `--thinking` flag (it will error). Confirm
  against `codex exec --help` and document the mapping in `docs/models.md`.
- Verify `--skip-git-repo-check` / sandbox / approval defaults don't block non-interactive runs in
  the engine's spawn context (codex exec refuses outside a git repo without `--skip-git-repo-check`;
  cycle repos are git repos, but confirm).

## Close the blind spot (the real reason this shipped)

Add a **real-codex contract check** so this can't regress behind the fake-agent tests: at minimum a
unit assertion that the codex argv begins with `"exec"` and never invokes bare `codex` with stdin;
ideally an opt-in smoke test that runs the real `codex` when present. Consider auditing the other
agent lanes (gemini / auggie / opencode / pi) for the same "bare interactive CLI vs non-interactive
subcommand" hazard.

## Acceptance

- `exec-codex` invokes `codex exec …`; a codex step runs against the **real** codex CLI without
  `stdin is not a terminal`.
- `thinking` is mapped to a valid `codex exec` option (or dropped) — no unknown-flag error.
- The fake-codex unit tests still pass, plus a guard asserts the `exec` subcommand is present.
- Once shipped (v0.1.14), recon can re-upgrade its vendored bin and run codex cleanly.
