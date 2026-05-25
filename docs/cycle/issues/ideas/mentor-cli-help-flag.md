---
id: mentor-cli-help-flag
title: "Add --help flag and fix no-args crash: cycle and cycle --help throw raw Node exceptions"
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

A tool that surfaces raw Node stack traces for the most common new-user interactions (`cycle` with no args, `--help`) fails the basic CLI quality bar. Parent agents that probe the tool's interface via `--help` receive noisy unstructured output.

## Fix

1. In `src/cli.ts`, intercept `--help` and no-args before any other dispatch and print a structured usage block, then exit 0.
2. In `src/cli/parse-args.ts`, add `help` to the `options` map for the `run` command so `cycle run --help` doesn't throw.

## Usage block (suggested)

```
cycle — issue-driven workflow engine for autonomous code changes

Usage:
  cycle run [<task>] [flags]   Triage and run the queue (optionally add a freeform task first)
  cycle drop <task>            Add a freeform task to the inbox without running
  cycle status                 Print queue counts and in-flight state
  cycle triage [--dry-run]     Re-run triage diagnostics
  cycle cleanup [--dry-run] [--yes] [--force]
                               List or delete orphaned cycle/* branches

Flags for run:
  --workflow <name>            Force a workflow (default: feature)
  --dry-run                    Preview triage/queue; no execution
  --no-skip-completed          Re-derive pre-build artifacts on retry
  --trunk                      Commit to base branch instead of per-cycle branches

  --version                    Print version and exit
  --help                       Show this help
```

## Acceptance Criteria

- [ ] `cycle` with no args prints usage and exits 0 (not a stack trace)
- [ ] `cycle --help` prints usage and exits 0
- [ ] `cycle run --help` prints usage and exits 0
- [ ] Usage lists all subcommands including `cleanup`
- [ ] Existing subcommand dispatch is unchanged
- [ ] All existing tests pass
