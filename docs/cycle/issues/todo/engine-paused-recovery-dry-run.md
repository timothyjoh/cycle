---
id: engine-paused-recovery-dry-run
title: "cycle triage --dry-run: test triage prompt against current raws without mutating state"
workflow: feature
depends_on: []
triaged_at: "2026-05-13T18:12:56.383Z"
source: triage
parent: engine-paused-recovery
---
## Why

When `engine.paused` fires, the recovery loop is: inspect raws → edit the triage prompt → re-fire the engine → hope it passes. Without a dry-run, every prompt iteration burns a real engine invocation and risks half-applying queue mutations on partial success.

Add a `cycle triage --dry-run` subcommand that runs the triage subroutine against the current `raw/` set, prints the parsed/validated JSON output (or the validation errors) to stdout, and writes nothing to disk.

## Scope

- New CLI subcommand: `cycle triage --dry-run` (parsing wired through `src/cli/parse-args.ts`).
- Reuses `src/engine/triage.ts`. Pass a `dryRun: true` option that:
  - Still spawns the configured triage agent per raw.
  - Still runs the per-raw retry loop and validator.
  - Skips every filesystem mutation: no `todo/<id>.md` writes, no `raw/<id>.md → done/<id>_raw.md` moves, no `tbd.jsonl` appends, no `log.jsonl` writes.
  - Returns a structured report: per-raw `{ raw_id, status: "ok" | "failed", attempts, last_error?, children? }`.
- CLI prints the report as pretty JSON to stdout. Exit 0 if every raw passed validation, non-zero if any failed (so it composes with shell pipelines).
- Honor the existing rule that `--dry-run` skips real triage from the engine loop — this command is the explicit handle for it.

## Acceptance

- Unit test: dry-run against a happy-path fixture prints a report with every raw status `ok` and exits 0.
- Unit test: dry-run against a fixture where one raw fails all retries reports `status: failed` with `last_error` populated; exits non-zero.
- Unit test: after dry-run, `raw/`, `todo/`, `done/`, `tbd.jsonl`, and `log.jsonl` are byte-identical to their pre-run state.
- Help text for `cycle triage --dry-run` describes the no-side-effects contract.
- Coverage thresholds hold.

## Out of scope

- A non-dry `cycle triage` subcommand (the engine loop owns real triage today; adding a manual handle is future work).
- Writing the report to a file. Stdout only.
