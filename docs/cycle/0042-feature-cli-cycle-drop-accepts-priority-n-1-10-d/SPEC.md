```markdown
# SPEC — Cycle 0042: `cycle drop --priority N` flag

## Objective
Add an optional `--priority N` (1..10) flag to the `cycle drop` CLI so authors can stamp a priority on freeform issues at drop time instead of editing frontmatter post-hoc. Defaults to `3`, matching the implicit default already written by `materializeFreeformIssue`. Closes the deferral from cycle 0019's SPEC §Out of Scope, which was never filed as a queue item until reflection-time triage produced this issue.

## Source Issue
`refl-0019-cycle-drop-priority-flag-deferred-no-fol` — "CLI: `cycle drop` accepts `--priority N` (1-10), defaults to 3"

## Scope

### In Scope
- Extend `parseArgs` in `src/cli/parse-args.ts` so the `drop` subcommand parses `--priority N` (integer, range `1..10`), with `DropArgs` carrying a `priority: number` field that defaults to `3`. Reject out-of-range, non-integer, and missing-value inputs with a clear error and non-zero exit.
- Thread `priority` through `materializeFreeformIssue(text, repoRoot, now, priority?)` so the rendered `raw/<id>.md` frontmatter writes the caller's value rather than the hard-coded `priority: 3`.
- Unit-test the new behavior end-to-end through both layers (parser validation + materialize output).

### Out of Scope
- Any `--priority` flag on `cycle run` or other subcommands.
- Reading/honoring `priority` during triage or queue ordering — current consumers already read this field; this cycle only changes who writes it.
- Bundling with the sibling `cli-drop-writes-to-raw-status-command` issue (separate concern on the same CLI surface, as noted in the issue body).
- A general `--help` framework for the CLI — only the existing `drop` help text (if any) updates; no new help infra.

## Requirements

### Functional
- `cycle drop "<text>" --priority N` writes `docs/cycle/issues/raw/<id>.md` whose YAML frontmatter contains `priority: N`.
- `cycle drop "<text>"` (no flag) writes `priority: 3`.
- `N` must satisfy `Number.isInteger(N) && N >= 1 && N <= 10`. Anything else (`0`, `11`, `3.5`, `"high"`, missing value) exits non-zero with a message naming the flag and the accepted range.
- Order of positional text and `--priority` flag is not significant: `cycle drop --priority 7 "foo"` and `cycle drop "foo" --priority 7` both work.
- `--help` (or the existing usage string surfaced when the command is malformed) documents the flag, its `1..10` range, and the `3` default. If no help mechanism exists for `drop` today, add a single usage line emitted on parse errors — do not build out a help system.

### Non-functional
- No change to the success-path stdout contract: still a single line `{"event":"issue.dropped","issue_id":"…","path":"…"}` so any caller piping the output continues to work.
- Validation errors go to stderr; success JSON stays on stdout.
- No new runtime dependencies. Parser stays on `node:util parseArgs`.

## Acceptance Criteria
- [ ] `cycle drop "foo" --priority 7` writes `raw/<id>.md` containing `priority: 7`.
- [ ] `cycle drop "foo"` writes `raw/<id>.md` containing `priority: 3`.
- [ ] `cycle drop "foo" --priority 0`, `--priority 11`, `--priority 3.5`, and `--priority high` all exit non-zero with a stderr message naming the flag and the `1..10` range.
- [ ] `cycle drop --priority` (no value) exits non-zero with a clear error.
- [ ] `cycle drop --priority 7 "foo"` (flag before text) succeeds identically to the flag-after-text form.
- [ ] Success-path stdout is unchanged: a single JSON line with `event: "issue.dropped"`, `issue_id`, `path`.
- [ ] `npm run typecheck` clean, `npm test` green, coverage not regressed against the master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%).
- [ ] CLAUDE.md commands table updated if the `drop` row exists; otherwise no doc change required there.

## Testing Strategy
- Framework: Node's built-in test runner (existing convention; see other `tests/**/*.test.ts`).
- New unit tests for `parseArgs`:
  - Default: `drop "foo"` → `{ command: "drop", text: "foo", priority: 3 }`.
  - Valid: `drop "foo" --priority 7` and `drop --priority 7 "foo"` both → `priority: 7`.
  - Boundary: `--priority 1` and `--priority 10` both accepted.
  - Invalid: `--priority 0`, `--priority 11`, `--priority 3.5`, `--priority high`, `--priority` (no value) — each throws (or returns an error sentinel consistent with how the file signals other parse errors today).
- New unit tests for `materializeFreeformIssue`:
  - Default invocation (no `priority` arg) writes `priority: 3`.
  - Explicit `priority: 7` writes `priority: 7`.
  - Reads back the file and asserts the frontmatter line, not just the in-memory return value.
- Integration: one test exercising the CLI entry (`src/cli.ts`) end-to-end through `drop` with `--priority 5`, asserting both the stdout JSON shape and the on-disk frontmatter.

## Documentation Updates
- **CLAUDE.md**: if the `Commands` table mentions `cycle drop`, update its row to surface `--priority N` and the `1..10` default-`3` semantics. (Current table does not appear to list `drop` explicitly; verify during implementation and update only if present, to avoid inventing new rows.)
- **README.md**: if a `drop` example exists, add the flag once with the default and range called out. Skip if no `drop` documentation is present today; do not create a new section.
- **AGENTS.md**: no change expected.

Documentation is part of "done" — if either file references `drop` and the reference is now incomplete, update it in this cycle.

## Dependencies
- `node:util` `parseArgs` (already in use).
- Existing `freeformId` helper at `src/cli/id.ts`.
- No new env vars, no external services.
```
