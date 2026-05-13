```markdown
# SPEC — Cycle 0020: `cycle status` command

## Objective
Add a `cycle status` subcommand that prints a compact, grep-friendly snapshot of the issue state machine and engine state. Operators get one-shot visibility into queue health without `ls`-ing folders or tailing `log.jsonl` by hand.

## Source Issue
`cli-drop-writes-to-raw-status-command` — "CLI: add `cycle status` command"

## Scope

### In Scope
- New `status` subcommand wired into `src/cli.ts` (handler in `src/cli/status.ts`) that prints: folder counts (`raw`/`todo`/`done`/`failed`/`blocked`), tbd.jsonl summary (total + by-status, listing `id`/`cycle_id` for `in_progress` rows), and in-flight cycle line derived from `log.jsonl` tail via `readLogTail`.
- Unit tests covering: empty repo, pending-only queue, `in_progress` row with matching in-flight cycle, finished cycle with no in-flight.

### Out of Scope
- Changing the `cycle drop` target (separate sibling issue).
- JSON output flag, colors, TTY detection, watch/live mode.
- Any engine behavior change — read-only command.

## Requirements
- `cycle status` accepts no arguments and exits 0 even when `docs/cycle/issues/` folders or `.cycle/tbd.jsonl` / `.cycle/log.jsonl` are missing.
- Missing folders count as zero; missing files yield a zeroed section, not an error.
- `log.jsonl` is read via `src/engine/log-tail.ts` (`readLogTail`/`parseLogTail`) — must not slurp the whole file.
- In-flight detection: most-recent `cycle.start` with no matching `cycle.end` ⇒ `in_flight: <cycle_id> step=<last step.start name>`; otherwise `in_flight: none`.
- Output is plain text, one logical group per line block, stable section ordering so it's grep- and diff-friendly.
- Subprocess discipline: no shell, no `exec`. Pure FS reads.

## Acceptance Criteria
- [ ] `cycle status` prints all five folder counts (`raw`, `todo`, `done`, `failed`, `blocked`), each on its own line.
- [ ] Prints tbd.jsonl total plus `pending` and `in_progress` counts; lists `id` + `cycle_id` for each `in_progress` row.
- [ ] Prints exactly one `in_flight:` line — either `none` or `<cycle_id> step=<step_name>`.
- [ ] Exits 0 in an empty repo (no `.cycle/`, no issue folders).
- [ ] Unit tests cover empty repo, pending-only, in-flight cycle with in_progress row, finished cycle.
- [ ] `npm run typecheck` clean; `npm test` passes.
- [ ] Coverage does not regress: line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node native `node:test` runner (matches existing `tests/` convention).
- Build a temp repo per test via `mkdtemp`, seed `docs/cycle/issues/<state>/*.md` and `.cycle/{tbd.jsonl,log.jsonl}` fixtures, invoke the status handler, assert on captured stdout.
- Scenarios:
  - **Empty repo**: no `.cycle/`, no issue folders → all counts 0, `in_flight: none`, exit 0.
  - **Pending-only queue**: tbd.jsonl rows all `status:pending` → total/pending counts correct, no in-flight rows listed.
  - **In-flight cycle**: one `in_progress` row + log tail showing `cycle.start` + `step.start` with no `cycle.end` → row id/cycle_id printed, `in_flight: <id> step=<name>`.
  - **Finished cycle**: log tail ends in `cycle.end` → `in_flight: none`.
  - **Missing files**: `.cycle/tbd.jsonl` absent → zero queue summary, no throw.
- No E2E/UI test required (CLI-only, no UI surface).

## Documentation Updates
- **CLAUDE.md**: add `cycle status` to the commands table (one-line description).
- **README.md**: surface `cycle status` in the user-facing CLI section if one exists; otherwise skip.
- No RFC update needed — this is a read-only ergonomics addition, not a lifecycle change.

## Dependencies
- `src/engine/log-tail.ts` — already exports `readLogTail` / `parseLogTail` (used by resume logic). Reuse, do not duplicate.
- `src/cli.ts` argv-parsing pattern — extend the existing subcommand switch.
- No external services, env vars, or new npm deps.
```
