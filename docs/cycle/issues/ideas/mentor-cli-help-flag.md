---
id: mentor-cli-help-flag
title: "Fix CLI no-args and --help: no-args runs queue, help/--help prints structured usage"
added_at: "2026-05-25T00:00:00.000Z"
source: mentor-review
triage_attempts: 0
priority_hint: 7
---

## Problem

Running `cycle` with no arguments throws:

```
Error: unknown command: (none)
    at parseArgs (dist/cycle.js:10049:33)
```

Running `cycle --help` throws:

```
Error: unknown command: --help
    at parseArgs (dist/cycle.js:10049:33)
```

Running `cycle run --help` throws a Node ERR_PARSE_ARGS_UNKNOWN_OPTION exception.

## Intended behavior

- `cycle` with no args → behaves identically to `cycle run` (triage + drain queue)
- `cycle help` and `cycle --help` → print structured usage block, exit 0
- `cycle run --help` → print usage, exit 0

## Fix

1. In `src/cli.ts`, when no subcommand is given, dispatch to `runRun()` as if `run` was passed.
2. Intercept `help` subcommand and `--help` flag before dispatch; print structured usage and exit 0.
3. In `src/cli/parse-args.ts`, add `help` to the `options` map for the `run` command so `cycle run --help` doesn't throw.

## Usage block (suggested)

```
cycle — issue-driven workflow engine for autonomous code changes

Usage:
  cycle [run] [<task>] [flags]  Triage and run the queue (optionally add a freeform task first)
  cycle drop <task>             Add a freeform task to the inbox without running
  cycle status                  Print queue counts and in-flight state
  cycle triage [--dry-run]      Re-run triage diagnostics
  cycle cleanup [--dry-run] [--yes] [--force]
                                List or delete orphaned cycle/* branches
  cycle help                    Show this help

Flags for run:
  --workflow <name>             Force a workflow (default: feature)
  --dry-run                     Preview triage/queue; no execution
  --no-skip-completed           Re-derive pre-build artifacts on retry
  --trunk                       Commit to base branch instead of per-cycle branches

  --version                     Print version and exit
  --help                        Show this help
```

## Acceptance Criteria

- [ ] `cycle` with no args runs the queue (same behavior as `cycle run`)
- [ ] `cycle help` prints usage and exits 0
- [ ] `cycle --help` prints usage and exits 0
- [ ] `cycle run --help` prints usage and exits 0
- [ ] Usage lists all subcommands including `cleanup`
- [ ] Existing subcommand dispatch is unchanged
- [ ] All existing tests pass
