---
id: txt-daemon-control-detach-stop-attach
title: "Daemon control: --detach flag, cycle stop, cycle attach"
added_at: "2026-05-16T00:00:00.000Z"
source: brief
triage_attempts: 0
priority_hint: 5
---

## Problem

Running `cycle run` blocks the terminal for the full queue drain. There is no way to start the engine in the background and control it afterward. Currently `pkill` is the only way to stop it.

## Spec (from BRIEF.md)

Engine grows an opt-in `--detach` flag. Blocking remains the default to preserve the CI / ephemeral-container exit-code contract.

- `cycle run --detach` — spawns a daemon, writes `.cycle/cycle.pid`. A second `run --detach` in the same repo refuses with a pointer to `cycle attach` / `cycle stop`. One daemon per repo.
- `cycle attach` — tail `.cycle/log.jsonl` from EOF; Ctrl-C detaches without killing the daemon.
- `cycle status` — one-shot JSON snapshot (already exists, read-only).
- `cycle stop` — graceful drain (finish the current step, then exit cleanly, emit `engine.stop`).
- `cycle stop --force` — SIGTERM immediately.

All three control commands are JSON-out by default; `--human` flag formats for terminals.

## Acceptance criteria

1. `cycle run --detach` starts the engine in the background and writes `.cycle/cycle.pid`.
2. A second `cycle run --detach` while a daemon is alive exits non-zero with a message pointing to `cycle attach` / `cycle stop`.
3. `cycle stop` sends a graceful-drain signal; the engine finishes the current step and exits, emitting `engine.stop {status: "stopped"}`.
4. `cycle stop --force` sends SIGTERM immediately.
5. `cycle attach` tails `log.jsonl` from EOF; Ctrl-C exits attach without killing the daemon.
6. `.cycle/cycle.pid` is removed on daemon exit (graceful or forced).
