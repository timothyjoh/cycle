---
id: feat-cycle-doctor-command
title: cycle doctor — on-demand preflight / environment check command
workflow: feature
depends_on: []
triaged_at: 2026-06-06T22:44:53.245Z
source: triage
priority: medium
---
## Problem

The preflight gate validates agent CLIs and required tools at engine start, but there is no way to run those checks **on demand**. An operator setting up a repo (or debugging a broken environment) must start a full `cycle run` to discover a missing or mis-pathed agent CLI. There is no `cycle doctor` / `cycle preflight` command.

## Already shipped — do NOT rebuild

The check logic already exists and is fully wired into engine start; this issue only exposes it as a standalone command. Reuse it as-is — do not duplicate the probing logic.

- `runPreflight` — probes every active-workflow + triage agent (`<bin> --version`, `CYCLE_<AGENT>_BIN`-aware resolution), confirms `bash`/`git` + detected bash-step tools resolve on PATH, emits a WSL `/mnt/c` shadow warning, never throws: `src/engine/preflight.ts`
- Wired at engine start with `engine.preflight.ok | warning | failed` events and `--skip-preflight` bypass: `src/cli.ts`
- `AGENT_BINARY` table with per-agent install remediation strings: `src/engine/preflight.ts`

## Scope

Add a user-invokable `cycle doctor` subcommand (alias `cycle preflight`) that runs the **existing** `runPreflight` against the loaded config and prints a human-readable report — exit 0 on a clean pass, non-zero when any check fails. A thin wrapper.

## Acceptance criteria

- [ ] `cycle doctor` runs `runPreflight` and prints each check (agent CLIs, required tools) with pass / warn / fail and the existing remediation strings.
- [ ] Exit 0 on a clean pass; non-zero if any check fails; warnings (e.g. `wsl_shadow`) do **not** flip the exit code.
- [ ] Reuses `runPreflight` + `AGENT_BINARY` — no second probe implementation.
- [ ] Registered in `parse-args`, the `cli.ts` dispatch, and the `cycle help` usage text.
- [ ] Read-only: does not acquire the engine lock or mutate any state.
- [ ] Tests: clean pass → exit 0; a forced-missing agent (via `CYCLE_<AGENT>_BIN` pointing at a non-existent binary) → exit non-zero; output names the failing binary.
- [ ] CLAUDE.md commands table + docs updated.

## Out of scope (explicit)

- **Interactive `init` agent selection / `--agent` flags / writing `workflows.yml`** — deferred. `init` stays non-interactive.
- **Rate-limit / provider-outage retry** — already implemented (`engine.rate_limit_backoff_ms`, `engine.max_rate_limit_retries`). Nothing to do.

Small, agent-agnostic, fail-loud (non-zero exit + named remediation).
