---
id: cli-drop-writes-to-raw
source: text
title: "CLI: cycle drop writes to raw/ instead of tbd/; add cycle status command"
added_at: 2026-05-13T03:44:00Z
triage_attempts: 0
priority: 3
---

## Why

After bootstrap, the inbox is `raw/` (not `tbd/`). The `cycle drop "<text>"` command still writes to `tbd/` per its current implementation in `src/cli/`. Update it to write to `raw/` so external agents and humans use the new path.

Also: add a `cycle status` command that prints:
- Counts in each folder (raw, todo, done, failed, blocked)
- Current `tbd.jsonl` rows (pending vs in_progress)
- Whether a cycle is currently in-flight (from `log.jsonl` tail)

## Acceptance
- `cycle drop "foo"` creates a file in `docs/cycle/issues/raw/`
- `cycle status` prints a compact summary
- Tests cover both commands
