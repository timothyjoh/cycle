Both identical. Writing stdout now:

```markdown
# Research: Cycle 0093

## Cycle Context

SPEC requires adding a `git diff --name-only "$BASE"...HEAD` guard to `src/defaults/scripts/verify.sh` that exits 1 (stderr message containing "no src changes") when all changed paths are under `docs/cycle/` or when no paths changed at all. `BASE` defaults via `${CYCLE_BASE:-master}`. The guard runs before the test-runner dispatch block. The matching change must also land in `.cycle/scripts/verify.sh` via `npm run sync-defaults`. Two new static source-text assertions must be added to `tests/defaults/scripts.test.ts`.

## Current Codebase State

### Relevant Components

- **`src/defaults/scripts/verify.sh`** (17 lines): The script being modified. Contains `set -euo pipefail`, then a `if [ -f package.json ]` block dispatching to `npm test`, `cargo test`, `pytest`, or a trivial-pass echo. No guard present. — `src/defaults/scripts/verify.sh:1-17`
- **`.cycle/scripts/verify.sh`** (17 lines): Byte-identical copy of the above (confirmed via `diff`). Must remain byte-identical after the change is applied via `npm run sync-defaults`. — `.cycle/scripts/verify.sh:1-17`
- **`tests/defaults/scripts.test.ts`** (19 lines): Existing test file with two test patterns: a loop over `["verify.sh", "commit.sh", "pr.sh"]` checking shebang + executable bit, and one named test `"verify.sh installs deps when node_modules is missing"` using `assert.match` on the script body. New guard assertions go here. — `tests/defaults/scripts.test.ts:1-19`
- **`scripts/sync-defaults.mjs`**: Copies `src/defaults/* → .cycle/*`, recording sha256 pairs in `.cycle/.sync-state.json`. `--force` or `CYCLE_SYNC_DEFAULTS_FORCE=1` overrides divergence guard. After editing `verify.sh`, running `npm run sync-defaults` is required. — `scripts/sync-defaults.mjs`
- **`src/engine/run-cycle.ts:127`**: Sets `CYCLE_BASE: process.env.CYCLE_BASE ?? "main"` in `cycleEnv` before calling `execBashStep`. This env var is what `verify.sh` will receive as `CYCLE_BASE`. Note: the engine defaults to `"main"`, while the SPEC requires the script to fallback to `"master"` — these are independent defaults (engine vs. standalone invocation).
- **`src/engine/exec-bash.ts:12-33`**: `execBashStep` spawns `/bin/bash <abs-path>` with `cwd: repoRoot` and `env: buildChildEnv(env)`. The `env` dict passed in is `cycleEnv` from `run-cycle.ts:124-130`, which includes `CYCLE_BASE`. — `src/engine/exec-bash.ts:12`

### Existing Patterns to Follow

- **Static source-text assertions**: `tests/defaults/scripts.test.ts` tests script content by `readFile("src/defaults/scripts/verify.sh", "utf8")` then `assert.match(body, /pattern/)`. New assertions must follow this exact pattern — no bash execution, no tmp repos. — `tests/defaults/scripts.test.ts:15-19`
- **Byte-identical dogfood pair test**: `tests/defaults/review-prompt-doc-claim-pass.test.ts:35-42` and `tests/defaults/plan-prompt-spec-traceability.test.ts:56-72` show the established pattern for asserting `Buffer.compare(src, dog) === 0`. The SPEC does not require adding this test for `verify.sh` (the SPEC only requires 2 new assertions), but the pattern exists if needed.
- **`CYCLE_BASE` env var in scripts**: `src/defaults/scripts/pr.sh:8` uses `: "${CYCLE_BASE:=main}"` (assign-if-unset form). The SPEC requires `${CYCLE_BASE:-master}` (substitution form, not assignment). Both are valid bash; use the substitution form as specified to keep the variable unmodified in the environment.
- **stderr redirect**: Other cycle scripts use `>&2` for error messages (e.g., `pr.sh:36`). The guard failure message must go to stderr.
- **`set -euo pipefail`**: Already present at line 4. The guard must be compatible with this — `grep -v` on an empty input exits 1 under `pipefail`, so the implementation must avoid triggering `set -e` prematurely. The issue file's suggested implementation uses `wc -l | tr -d ' '` which avoids this; alternatively the diff output can be captured and tested with `[ -z "..." ]`.

### Dependencies & Integration Points

- **`npm run sync-defaults`**: After editing `src/defaults/scripts/verify.sh`, this must be run to mirror the change to `.cycle/scripts/verify.sh`. Sync is divergence-guarded; since both files are currently identical, a clean sync will succeed without `--force`. — `scripts/sync-defaults.mjs`
- **`execBashStep`**: Passes the full `cycleEnv` dict (including `CYCLE_BASE`) to the script via `buildChildEnv`. Script receives `CYCLE_BASE` as an environment variable whenever invoked by the engine. — `src/engine/exec-bash.ts:18`
- **`buildChildEnv`**: Merges the provided env dict onto `process.env` with PATH prepend. Relevant: `CYCLE_BASE` will be present in the child process's environment. — `src/engine/child-env.ts`

### Test Infrastructure

- **Framework**: Node's native `node:test` runner, via `npm test`. 434 tests, all passing.
- **Convention**: Test files under `tests/`, named `*.test.ts`. Run directly with `--experimental-strip-types` (no transpile). Import `{ test }` from `"node:test"` and `{ strict as assert }` from `"node:assert"`.
- **Defaults test pattern**: `tests/defaults/scripts.test.ts` reads scripts as UTF-8 strings and uses `assert.match(body, /regex/)` — no subprocess execution. The two new assertions must follow this pattern per SPEC.
- **Coverage of change area**: No coverage measurement applies to `verify.sh` itself (it's a bash script). The TypeScript coverage gate (`src/engine/triage.ts ≥ 95%`) is unaffected by this change. The `scripts.test.ts` file is in `scripts/` exclusion zone for LCOV but the test counts toward the test suite pass/fail gate.

## Code References

- `src/defaults/scripts/verify.sh:1-17` — Full current body; guard insertion point is between line 4 (`set -euo pipefail`) and line 6 (the `if [ -f package.json ]` test-runner block)
- `.cycle/scripts/verify.sh:1-17` — Byte-identical copy; updated via `npm run sync-defaults` after src change
- `tests/defaults/scripts.test.ts:15-19` — Existing `"verify.sh installs deps"` test; new assertions appended after line 19
- `src/engine/run-cycle.ts:124-130` — `cycleEnv` construction where `CYCLE_BASE` is set
- `src/engine/run-cycle.ts:182` — `execBashStep(repoRoot, step.command!, cycleEnv)` — how bash steps receive env
- `src/engine/exec-bash.ts:12-33` — `execBashStep` implementation; spawns `/bin/bash` with provided env
- `src/defaults/scripts/pr.sh:8` — Reference usage of `CYCLE_BASE` in another default script (`:=main` form)
- `scripts/sync-defaults.mjs:1` — Sync tool; run after editing verify.sh

## Open Questions

- **`set -e` + `grep -v` interaction**: The suggested implementation in the issue file uses `grep -v '^docs/cycle/' | wc -l`. Under `set -euo pipefail`, if `git diff --name-only` produces no output, `grep -v` exits 1 (no match), which kills the script before the `if` check. The planner must choose an implementation that handles the empty-diff case correctly — either capture the diff output first with a subshell that bypasses `-e`, or use `grep ... || true`, or count lines differently.
- **`CYCLE_BASE` default mismatch**: The engine sets `CYCLE_BASE` to `"main"` (`run-cycle.ts:127`) while the SPEC says the fallback in the script must be `master`. These serve different callers (engine vs. standalone manual invocation). The planner should confirm whether the script's fallback value (`master`) matters for the dogfood repo (which runs on `master`) or if the engine always supplies `CYCLE_BASE` making the fallback moot during engine-driven runs.
```
