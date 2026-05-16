---
id: txt-daemon-control-detach-stop-attach-daemon-attach
title: "Implement `cycle attach`: tail log.jsonl from EOF with Ctrl-C detach"
workflow: feature
depends_on: [txt-daemon-control-detach-stop-attach-daemon-spawn-pid]
triaged_at: "2026-05-16T01:23:10.830Z"
source: triage
parent: txt-daemon-control-detach-stop-attach
---
## Problem

Once a daemon is running via `cycle run --detach`, there is no way to observe its progress without tailing `.cycle/log.jsonl` manually.

## Scope

Add a `cycle attach` subcommand that streams the daemon's output to the terminal without affecting the daemon's lifecycle.

1. Add `attach` subcommand to the CLI (`src/cli/parse-args.ts`, `src/cli.ts`).
2. Read `.cycle/cycle.pid` and verify the daemon is alive; exit non-zero with a message if not.
3. Open `.cycle/log.jsonl`, seek to EOF, then stream new lines as they are appended (use `fs.watch` or `tail -f` style polling with `fs.read`).
4. Each line is a JSON log event; format it for human readability by default, or raw JSON with `--json`.
5. Ctrl-C (SIGINT on the attach process) exits the attach process cleanly without sending any signal to the daemon.

## Acceptance criteria

- `cycle attach` tails `log.jsonl` from EOF and prints new events as the daemon emits them.
- Ctrl-C exits the attach process; the daemon continues running.
- `cycle attach` exits non-zero with a message when no daemon PID file exists or the PID is not alive.
- `--json` flag passes raw log lines through without formatting.

## Files likely touched

- `src/cli/parse-args.ts` — add `attach` subcommand with `--json` flag
- `src/cli.ts` — `attach` handler: PID check, seek-to-EOF tail loop, SIGINT handler
- Tests covering the alive guard and Ctrl-C detach behavior
