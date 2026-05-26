---
id: mentor-cli-help-flag
title: "Fix CLI no-args and --help: no-args runs queue, help/--help prints structured usage"
workflow: feature
depends_on: []
triaged_at: "2026-05-25T22:01:15.554Z"
source: triage
priority: medium
---
## Problem

Three broken entry points in `src/cli.ts` / `src/cli/parse-args.ts`:

1. `cycle` (no args) throws `Error: unknown command: (none)`
2. `cycle --help` throws `Error: unknown command: --help`
3. `cycle run --help` throws `ERR_PARSE_ARGS_UNKNOWN_OPTION`

## Fix

### 1. No-args → dispatch to `run`

In `src/cli.ts`, when `parseArgs` returns no subcommand (or empty string), default to `runRun()` as if `run` was passed.

### 2. `help` / `--help` intercept

Before the subcommand dispatch switch, check:
- `argv[0] === 'help'`
- `argv[0] === '--help'`
- `argv.includes('--help')` (catches `cycle run --help`)

Print the structured usage block below and `process.exit(0)`.

### 3. `cycle run --help` option registration

In `src/cli/parse-args.ts`, add `help` to the `options` map for the `run` command (type `boolean`, default `false`) so Node's `parseArgs` doesn't throw on `--help`.

## Usage block

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
- [ ] New tests cover: no-args dispatch, help subcommand, --help flag, run --help flag
