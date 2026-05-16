---
id: txt-daemon-control-detach-stop-attach-daemon-spawn-pid
title: "Implement `cycle run --detach`: daemon spawn, PID file, and alive guard"
workflow: feature
depends_on: []
triaged_at: "2026-05-16T01:23:10.830Z"
source: triage
parent: txt-daemon-control-detach-stop-attach
---
## Problem

`cycle run` blocks the terminal for the full queue drain. There is no way to start the engine in the background. `pkill` is the only stop mechanism today.

## Scope

Implement the daemon spawn half of the daemon-control feature:

1. Add `--detach` flag to `cycle run` in `src/cli/{parse-args,init}.ts` and `src/cli.ts`.
2. When `--detach` is set, spawn `node dist/cycle.js run` (without `--detach`) as a detached child process with `stdio: 'ignore'` and `detached: true`, then call `child.unref()` so the parent exits immediately.
3. Write the child PID to `.cycle/cycle.pid` (create or overwrite).
4. Before spawning, check for an existing `.cycle/cycle.pid`. If the file exists and the PID is still alive (`process.kill(pid, 0)` succeeds), exit non-zero with a message pointing to `cycle attach` / `cycle stop`.
5. Remove `.cycle/cycle.pid` on daemon exit — register cleanup in `engine.stop` emission path and on uncaught signals (SIGTERM, SIGINT).

## Acceptance criteria

- `cycle run --detach` writes `.cycle/cycle.pid` and returns exit 0 immediately while the engine continues in the background.
- A second `cycle run --detach` while the daemon is alive exits non-zero with a message referencing `cycle attach` and `cycle stop`.
- `.cycle/cycle.pid` is removed when the daemon exits cleanly.
- Blocking `cycle run` (no `--detach`) behavior is unchanged.

## Files likely touched

- `src/cli/parse-args.ts` — add `--detach` flag
- `src/cli.ts` — branch on detach: spawn + write PID + exit vs run inline
- `src/engine/run-cycle.ts` or a new `src/engine/pid.ts` — PID file helpers (write, read, remove, alive-check)
- Tests under `tests/` covering the alive guard and PID cleanup
