# SPEC — Cycle 0225: Load .cycle/.env at Engine Bootstrap

## Objective

The engine currently has no mechanism for reading `.cycle/.env`, despite CLAUDE.md documenting that `CYCLE_TRUNK_BASED=1` in that file is the canonical way to enable trunk-based mode for a repo. The shipped workflow default is `commit.mode: worktree-pr`, so repos relying on `.cycle/.env` silently run in worktree-pr mode — creating branches and worktrees instead of committing to trunk. This cycle introduces a hand-rolled `.cycle/.env` loader that fires at engine bootstrap, before `loadConfig()`, so the variable is present when workflow resolution reads it.

## Source Issue

`redesign-02-load-cycle-env` — "Load .cycle/.env at engine bootstrap so CYCLE_TRUNK_BASED is honored as documented"

## Scope

### In Scope

- New module `src/engine/dot-env.ts` exporting `loadDotEnv(filePath: string): void`
- Wire `loadDotEnv` into `src/cli.ts` between the `--trunk` flag check (line 137) and `loadConfig()` (line 139)
- Register `src/engine/dot-env.ts` in `scripts/coverage-gate.mjs` `FLOORS` table at 100% line coverage

### Out of Scope

- Changing the shipped default (`worktree-pr`) in `src/defaults/workflows.yml`
- Supporting quoted values, multi-line values, or variable interpolation in `.env` files
- Reading `.env` files from locations other than `.cycle/.env`

## Requirements

- `loadDotEnv` reads the file synchronously with `fs.readFileSync`; on `ENOENT` it returns immediately with no error or log output.
- Parse `KEY=VALUE` lines: split on first `=`; key is everything before, trimmed; value is everything after, trimmed.
- Skip blank lines and lines whose first non-whitespace character is `#`.
- Skip lines with no `=` character.
- Set `process.env[key] = value` only when `process.env[key] === undefined` — real environment wins, and `--trunk` wins because it sets `CYCLE_TRUNK_BASED` at line 137 before `loadDotEnv` runs.
- No external dependencies; no `shell: true`; no `exec`/`execSync`.

## Acceptance Criteria

- [ ] With `.cycle/.env` containing `CYCLE_TRUNK_BASED=1` and `CYCLE_TRUNK_BASED` not exported in the shell, `cycle run` resolves `commit.mode` to `trunk`. Verifiable via a `cycle.checkout` log event with `reason: "trunk"` or equivalent trunk-mode behavior.
- [ ] A real exported env var (`CYCLE_TRUNK_BASED=1` in the process environment) takes precedence over a conflicting value in `.cycle/.env`.
- [ ] `--trunk` CLI flag takes precedence over `.cycle/.env` (flag sets `process.env.CYCLE_TRUNK_BASED = "1"` at cli.ts:137 before `loadDotEnv` runs at line 138).
- [ ] Blank lines, `#`-prefixed comment lines, and lines with no `=` character are silently skipped — no error thrown, no log noise.
- [ ] A missing `.cycle/.env` file is a no-op — no thrown error, no log output.
- [ ] Unit tests cover all five cases above. `src/engine/dot-env.ts` reaches 100% line coverage per `npm run check:coverage`.
- [ ] `npm test` passes with no regressions. All existing coverage floors hold.

## Testing Strategy

- Framework: Node built-in test runner (`node:test`) matching the project's existing test conventions.
- Unit tests for `dot-env.ts` directly: use `os.tmpdir()` + random filenames to avoid filesystem coupling; test `ENOENT` (missing file), blank-line skip, comment-line skip, no-`=`-line skip, real-env-wins (pre-set `process.env[key]` before calling), and normal parse-and-set.
- Integration smoke: verify `CYCLE_TRUNK_BASED` written by `loadDotEnv` propagates through `loadConfig()` and results in trunk-mode workflow resolution (`commit.mode === "trunk"`).
- After each test that mutates `process.env`, restore original value to avoid cross-test contamination.

## Documentation Updates

- **CLAUDE.md**: No change required — the `.env` mechanism is already documented as the canonical way to enable trunk mode. After this cycle the documentation becomes accurate.
- **docs/ENGINE.md**: Add a note under the bootstrap section that `loadDotEnv(.cycle/.env)` runs before `loadConfig()` with the real-env-wins precedence rule.

## Dependencies

- `src/engine/workflow.ts` must already export `loadConfig` and read `CYCLE_TRUNK_BASED` from `process.env` (confirmed: line 86).
- `src/cli.ts` must already set `process.env.CYCLE_TRUNK_BASED = "1"` for `--trunk` (confirmed: line 137).
- `scripts/coverage-gate.mjs` `FLOORS` table must be extendable (confirmed: existing pattern for `src/engine/path-utils.ts`).
