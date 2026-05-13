---
id: cli-drop-writes-to-raw-status-command
title: "CLI: add `cycle status` command"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:11:17.546Z"
source: triage
parent: cli-drop-writes-to-raw
---
## Context

Operators currently have no fast way to see what the engine queue looks like without `ls`-ing folders and tailing `log.jsonl` by hand. Add a `cycle status` subcommand that prints a compact, machine-and-human-readable snapshot of the issue state machine and engine state.

## Scope

New subcommand `cycle status` in `src/cli/` that prints:

1. **Folder counts** under `docs/cycle/issues/`: `raw`, `todo`, `done`, `failed`, `blocked`. Zero is fine; missing folder is treated as zero.
2. **Queue rows** from `.cycle/tbd.jsonl`: total count, split by `status` (`pending` vs `in_progress`). For `in_progress` rows, also print `id` and `cycle_id`.
3. **In-flight cycle** from `.cycle/log.jsonl` tail (reuse `src/engine/log-tail.ts`): if the most-recent `cycle.start` has no matching `cycle.end`, print `in_flight: <cycle_id> step=<last step.start name>`; otherwise `in_flight: none`.

Output format: plain text, one section per line group. Keep it grep-friendly. No JSON flag in this cycle (can come later).

## Acceptance

- `cycle status` runs without arguments and exits 0 even when folders are empty or files are missing.
- Output includes all five folder counts, the tbd.jsonl summary, and the in-flight line.
- Reads `log.jsonl` via `readLogTail` — does not load the whole file into memory.
- Unit tests cover: empty repo, repo with pending rows only, repo with one in_progress row + in-flight cycle, repo with finished cycle (no in-flight).
- Coverage does not regress against the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Out of scope

- Changing the drop target (separate child issue).
- Pretty-printing / colors / TTY detection.
- Watch/live mode.
