# SPEC — Cycle 0251: Fix CLI No-Args and Help Entry Points

## Objective

Three entry points in the cycle CLI throw raw Node errors instead of doing useful work. Running `cycle` with no arguments throws `Error: unknown command: (none)`. Running `cycle --help` or `cycle help` throws `Error: unknown command: --help`. Running `cycle run --help` throws `ERR_PARSE_ARGS_UNKNOWN_OPTION`. This cycle fixes all three: no-args defaults to queue drain (same as `cycle run`), and any `--help` / `help` invocation prints structured usage and exits cleanly.

## Source Issue

`mentor-cli-help-flag` — "Fix CLI no-args and --help: no-args runs queue, help/--help prints structured usage"

## Scope

### In Scope

- No-args invocation defaults to `run` (dispatches queue drain)
- `cycle help`, `cycle --help`, and `cycle run --help` all print a structured usage block and exit 0
- `--help` option registered in `src/cli/parse-args.ts` for the `run` command so Node's `parseArgs` does not throw

### Out of Scope

- Subcommand-specific help (`cycle run --help` showing run-only flags differently from top-level help)
- Man page or markdown help generation
- Any changes to existing subcommand behavior other than `run`

## Requirements

- When `argv` is empty, `src/cli.ts` must dispatch the same code path as `cycle run` (no explicit subcommand required)
- Before calling `parseArgs`, `src/cli.ts` must intercept `argv[0] === 'help'`, `argv[0] === '--help'`, and `argv.includes('--help')` (covers `cycle run --help`)
- The help intercept must print the exact usage block from the issue and call `process.exit(0)`
- `src/cli/parse-args.ts` must register `help: { type: "boolean", default: false }` in the `run` options map so `nodeParseArgs` never throws on `--help`
- No-args path in `parseArgs` must return a valid `RunArgs` with `command: "run"` rather than throwing

## Acceptance Criteria

- [ ] `node .cycle/bin/cycle.js` with no args begins queue drain (emits `engine.start` or equivalent, does not throw)
- [ ] `node .cycle/bin/cycle.js help` prints usage text containing `cycle — issue-driven workflow engine` and exits 0
- [ ] `node .cycle/bin/cycle.js --help` prints usage text containing `cycle — issue-driven workflow engine` and exits 0
- [ ] `node .cycle/bin/cycle.js run --help` prints usage text containing `cycle — issue-driven workflow engine` and exits 0
- [ ] Usage output lists all six subcommands: `run`, `drop`, `status`, `triage`, `cleanup`, `help`
- [ ] `parseArgs([])` returns `{ command: "run", ... }` without throwing
- [ ] `parseArgs(['run', '--help'])` does not throw `ERR_PARSE_ARGS_UNKNOWN_OPTION`
- [ ] All existing tests pass
- [ ] New tests cover: no-args dispatch, `help` subcommand, `--help` flag, `run --help` flag

## Testing Strategy

- Framework: Node built-in test runner (`node:test`) — matches the existing test suite
- `tests/cli/parse-args.test.ts`: add cases for `parseArgs([])` returns run command; `parseArgs(['run', '--help'])` does not throw; `parseArgs(['--help'])` either returns run or is handled upstream (document whichever approach is taken)
- `tests/cli/help.test.ts` (new): spawn the built `dist/cycle.js` with no args, `help`, `--help`, `run --help`; assert stdout contains the usage sentinel string and exit code is 0 (for help cases); assert no-args exit behavior is not exit-1-from-throw
- Build must succeed (`npm run build`) before integration tests can run — `pretest` handles this

## Documentation Updates

- **CLAUDE.md**: No command table changes needed; `cycle help` is self-documenting
- **README.md**: No change needed for this cycle; help output is user-facing but README already documents invocation

## Dependencies

- `dist/cycle.js` must exist (built by `npm run build` / `pretest`) for integration tests that spawn the binary
- No new npm dependencies
