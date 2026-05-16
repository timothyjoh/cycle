---
id: txt-daemon-control-detach-stop-attach-daemon-stop
title: Implement `cycle stop` and `cycle stop --force` daemon shutdown commands
workflow: feature
depends_on: [txt-daemon-control-detach-stop-attach-daemon-spawn-pid]
triaged_at: "2026-05-16T01:23:10.830Z"
source: triage
parent: txt-daemon-control-detach-stop-attach
---
## Problem

Once a daemon is running via `cycle run --detach`, there is no way to stop it other than `pkill`. This task adds the `cycle stop` and `cycle stop --force` subcommands.

## Scope

1. Add `stop` subcommand to the CLI (`src/cli/parse-args.ts`, `src/cli.ts`).
2. `cycle stop` (graceful): read `.cycle/cycle.pid`, send `SIGUSR2` (or `SIGUSR1`) to the daemon. The daemon catches this signal, sets a drain-and-stop flag, finishes the current step, then exits cleanly emitting `engine.stop {status: "stopped"}` and removing `.cycle/cycle.pid`.
3. `cycle stop --force`: read `.cycle/cycle.pid`, send `SIGTERM` to the daemon immediately. Daemon removes `.cycle/cycle.pid` in its SIGTERM handler before exiting.
4. Both commands exit non-zero with a clear message if `.cycle/cycle.pid` is missing or the PID is not alive.
5. JSON output by default; `--human` flag formats for terminal readability.

## Signal handling in daemon

In the daemon's main loop in `src/cli.ts`:
- Register a `SIGUSR2` handler that sets a module-level `gracefulStop = true` flag.
- After each step completes, check the flag before starting the next step; if set, break the loop and fall through to `engine.stop`.
- Register a `SIGTERM` handler that removes `.cycle/cycle.pid` and calls `process.exit(0)`.

## Acceptance criteria

- `cycle stop` sends graceful-drain signal; daemon finishes the running step then exits emitting `engine.stop {status: "stopped"}`.
- `cycle stop --force` sends SIGTERM; daemon exits promptly.
- Both commands exit non-zero with a useful message when no daemon is running.
- `.cycle/cycle.pid` is removed on both graceful and forced exit.

## Files likely touched

- `src/cli/parse-args.ts` — add `stop` subcommand with `--force` flag
- `src/cli.ts` — `stop` handler reads PID, sends signal; daemon loop registers signal handlers
- Tests covering graceful vs force stop behavior
