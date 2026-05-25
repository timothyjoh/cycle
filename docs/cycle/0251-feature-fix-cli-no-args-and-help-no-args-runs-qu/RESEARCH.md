# Research: Cycle 0251

## Cycle Context

This cycle fixes three broken CLI entry points: `cycle` with no arguments throws `Error: unknown command: (none)`, `cycle --help` and `cycle help` throw `Error: unknown command: --help`, and `cycle run --help` throws `ERR_PARSE_ARGS_UNKNOWN_OPTION`. The fix requires three coordinated changes: (1) `src/cli.ts` must intercept `help`/`--help` before calling `parseArgs` and dispatch no-args to the `run` path, (2) `src/cli/parse-args.ts` must treat an empty argv as `run` instead of throwing, and (3) `parseArgs` must register a `help` option for the `run` command so `nodeParseArgs` doesn't throw on `--help`.

## Current Codebase State

### Relevant Components

- **CLI entry point**: `src/cli.ts` — top-level dispatcher; handles all subcommands via a series of `if (argv[0] === "...")` guards before calling `parseArgs`. `argv` is sliced from `process.argv` at line 43. Existing dispatch guards: `--version` (line 44), `init` (line 49), `status` (line 56), `triage` (line 63), `run-one` (line 71), `cleanup` (line 78). `parseArgs(argv)` is called at line 85 with no prior guard for `help`, `--help`, or empty argv.
- **Argument parser**: `src/cli/parse-args.ts:19` — `parseArgs(argv: string[])` function. Line 40 is the failure point: `if (argv[0] !== "run") throw new Error(\`unknown command: ${argv[0] ?? "(none)"}\`)`. An empty array produces `"(none)"`, and `--help` produces `"unknown command: --help"`. For the `run` branch, `nodeParseArgs` is called at line 42 with options `workflow`, `dry-run`, `no-skip-completed`, `trunk` — no `help` option registered, so `--help` as a run flag causes `ERR_PARSE_ARGS_UNKNOWN_OPTION`.
- **RunArgs type**: `src/cli/parse-args.ts:3-10` — `{ command: "run"; text: string | null; workflow: string; dryRun: boolean; noSkipCompleted: boolean; trunk: boolean }`. No `help` field present.
- **ParsedArgs union**: `src/cli/parse-args.ts:17` — `RunArgs | DropArgs`. No `HelpArgs` type exists.
- **Version guard pattern**: `src/cli.ts:44-47` — the existing `--version` guard reads `argv[0]`, prints, and calls `process.exit(0)`. This is the established pattern to follow for `--help` and `help` intercepts.
- **`init` guard pattern**: `src/cli.ts:49-54` — dynamic import and `process.exit(0)`. Same early-exit shape.
- **`run` dispatch downstream**: After `parseArgs` at line 85, `args.command === "drop"` is checked at line 88. The `run` command flow continues past that check and into the queue drain logic. No-args dispatch must produce a valid `RunArgs` with `command: "run"`.

### Existing Patterns to Follow

- **Early argv[0] guard**: Every subcommand dispatched in `src/cli.ts` uses `if (argv[0] === "<cmd>")` before the `parseArgs` call. The `help`/`--help` intercept must follow this same pattern, placed before line 85.
- **`process.exit(0)` for informational output**: `--version` and each subcommand handler call `process.exit(0)` after printing. The help handler must do the same.
- **`parseArgs` returns typed `ParsedArgs`**: The return type of `parseArgs` is `ParsedArgs` (`RunArgs | DropArgs`). If no-args is handled inside `parseArgs` by returning a default `RunArgs`, the return type is unchanged. If handled in `src/cli.ts` before calling `parseArgs`, `parseArgs` would not be called at all for empty argv.
- **`nodeParseArgs` options registration**: Each recognized flag for a command is registered in the `options` map passed to `nodeParseArgs`. `help` must be added as `{ type: "boolean", default: false }` in the `run` options map (line 44-49 of `parse-args.ts`).
- **Test file naming**: Integration tests that spawn the built binary live in `tests/cli/`. The new `tests/cli/help.test.ts` file follows the same directory as `halt.test.ts`, `queue-drain.test.ts`, etc.
- **`ensureDist()` pattern**: Every integration test that spawns `dist/cycle.js` calls `ensureDist()` (reads the file to verify it exists) and uses `REPO = process.cwd()` to build the path — seen in `tests/cli/halt.test.ts:10-15` and `tests/cli/queue-drain.test.ts:10-14`.
- **`spawnSync` for CLI invocations**: Integration tests use `spawnSync("node", [dist, ...argv], { cwd: root, encoding: "utf8" })` — seen throughout `tests/cli/halt.test.ts`. The result's `.status`, `.stdout`, and `.stderr` are asserted on.
- **`node:test` test runner**: All tests use `import { test } from "node:test"` and `import { strict as assert } from "node:assert"`. No external test frameworks.

### Dependencies & Integration Points

- **`src/cli.ts` → `src/cli/parse-args.ts`**: Imports `parseArgs` and `RunArgs` at lines 6 and 31. Any new `HelpArgs` type (if introduced) would require an export addition, but the SPEC avoids adding a `HelpArgs` type — `help` is handled before `parseArgs` is called.
- **`dist/cycle.js`**: The built bundle produced by `npm run build` (esbuild bundles `src/cli.ts`). Integration tests in `tests/cli/help.test.ts` must spawn this binary. `pretest` runs the build automatically.
- **`node:util` `parseArgs`**: Called as `nodeParseArgs` in `parse-args.ts`. The `ERR_PARSE_ARGS_UNKNOWN_OPTION` error is thrown by Node's built-in parser when an unregistered option is passed. Registering `help: { type: "boolean", default: false }` in the options map resolves this without changing the return type.
- **Coverage gate**: `scripts/coverage-gate.mjs` FLOORS table does not include `src/cli.ts` or `src/cli/parse-args.ts` — no per-file floor to maintain for these files, but aggregate thresholds (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) apply.
- **Structural invariants**: `scripts/structural-invariants.mjs` INVARIANTS table has one entry for `src/cli.ts` (line 26) asserting `commit-scope-guard-loop` appears 0 times. No invariants touch `parse-args.ts`. No invariant will be triggered by this change.

### Test Infrastructure

- **Framework**: `node:test` built-in test runner with `--experimental-strip-types` (TypeScript run directly, no transpile).
- **Test runner command**: `npm test` — runs `node --test --experimental-strip-types --test-reporter=spec` across all `tests/**/*.test.ts` files.
- **Test file glob**: `npm test` runs all files matching the default test discovery pattern; new `tests/cli/help.test.ts` will be auto-discovered.
- **Integration test pattern**: Spawn `dist/cycle.js` via `spawnSync("node", [dist, ...flags], { cwd: root, encoding: "utf8" })`. Assert `r.status` (exit code) and `r.stdout`/`r.stderr` content.
- **Unit test pattern for `parse-args`**: `tests/cli/parse-args.test.ts` imports `parseArgs` directly and calls it synchronously. All 11 existing tests follow `parseArgs([...argv])` → `assert.deepEqual` or `assert.throws` pattern.
- **Existing parse-args coverage**: `tests/cli/parse-args.test.ts` has tests for `run`, `run <text>`, `--no-skip-completed`, `--workflow`, `--dry-run`, `drop`, `drop` with no text, `drop --priority` (rejected), unknown command, `--trunk`. No tests for empty argv, `help`, or `--help`.
- **`expectExactlyOne` helper**: `tests/helpers.ts:3` — used in event-assertion tests. Not needed for CLI output/exit-code assertions in the new help tests.
- **Integration test bootstrap**: For tests that need an engine invocation, `bootstrapRepo()` sets up a temp git repo with `workflows.yml`, scripts dir, and issue folders. For the help/no-args tests, a minimal or no bootstrapped repo may be sufficient since help exits before engine startup.

## Code References

- `src/cli.ts:43` — `const argv = process.argv.slice(2)` — argv extraction
- `src/cli.ts:44-47` — `--version` guard pattern (model for `--help`/`help` intercept)
- `src/cli.ts:85` — `const args = parseArgs(argv)` — the call site that receives unguarded empty argv and `--help`
- `src/cli/parse-args.ts:40` — `if (argv[0] !== "run") throw new Error(...)` — the no-args and `--help` throw site
- `src/cli/parse-args.ts:42-51` — `nodeParseArgs` call for `run` — missing `help` option registration
- `src/cli/parse-args.ts:3-10` — `RunArgs` type definition — no `help` field; `help` option value need not appear in return type per SPEC
- `tests/cli/parse-args.test.ts:1-69` — existing unit tests; no empty-argv or `--help` cases
- `tests/cli/halt.test.ts:10-15` — `ensureDist()` helper pattern for integration tests
- `tests/cli/halt.test.ts:119` — `spawnSync("node", [dist, "run"], ...)` invocation pattern
- `scripts/coverage-gate.mjs:12-31` — FLOORS table; `src/cli/parse-args.ts` not listed (no per-file floor)
- `scripts/structural-invariants.mjs:26-30` — only `src/cli.ts` invariant: `commit-scope-guard-loop` count = 0

## Open Questions

- Should no-args handling live inside `parseArgs` (returning default `RunArgs`) or be intercepted in `src/cli.ts` before `parseArgs` is called? The SPEC says both approaches are valid (line 48: "document whichever approach is taken"), but the two approaches have different test implications: if inside `parseArgs`, `parseArgs([])` unit test can assert the return value; if outside, the unit test for empty-argv is in the integration test only.
- The SPEC's `parseArgs(['--help'])` note (line 48) says "either returns run or is handled upstream" — the planner must choose one and be consistent with where `argv.includes('--help')` intercept lives.
- Integration tests for no-args need to assert that the engine starts (emits `engine.start` or similar) but the test repo needs `workflows.yml` and a git repo. The SPEC says "begins queue drain (emits `engine.start` or equivalent, does not throw)" — this requires a bootstrapped temp repo or the test can simply assert `r.status !== 1` and absence of the old error string in stderr.
