# Research: Cycle 0033

## Cycle Context
SPEC.md asks for a first-class `cycle upgrade` command: a non-destructive, in-place engine refresh for an already-initialized repo. It must always refresh the never-user-edited engine artifacts (`.cycle/bin/cycle.js` mode `0755`, `.cycle/package.json` exact init literal), default-preserve the three user-editable config categories (`.cycle/workflows.yml`, `.cycle/prompts/**`, `.cycle/scripts/**`) while overwriting each only under its own opt-in flag (`--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, `--overwrite-all`), and never touch state files (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`). Directory categories clean-replace (rm then cp) on opt-in. An uninitialized repo or unknown flag must fail loudly with a non-zero exit and write nothing, before any I/O. The deliverable spans `src/cli/upgrade.ts`, `src/cli.ts` dispatch + help text, `tests/cli/upgrade.test.ts`, `docs/upgrade.md`, the CLAUDE.md command-table row, and a per-file coverage floor in `scripts/coverage-gate.mjs`.

## Current Codebase State

A complete implementation matching the SPEC contract already exists and is committed at HEAD (`bf15019`). The source file, dispatch wiring, help text, tests, docs, coverage floor, and CLAUDE.md row are all present. The issue was re-queued (per `txt-20260602-233000-upgrade-command-requeue.md`) after a prior overnight attempt (cycle 0029) failed only on an environment break unrelated to the feature. A stale WIP exists at `git stash@{0}` ("0029 upgrade-command WIP") and the issue explicitly instructs to ignore it.

### Relevant Components

- **`runUpgrade` (the command implementation)**: full upgrade contract — unknown-flag guard, initialized guard, source location, always-refresh engine artifacts, per-category opt-in overwrite, human-readable summary — `src/cli/upgrade.ts:20-110`.
- **`KNOWN_FLAGS` table**: the four recognized flags driving both the unknown-flag guard and per-category resolution — `src/cli/upgrade.ts:7-12`.
- **`UpgradeResult` return shape**: `{ exitCode: number; stdout: string; stderr: string }` — `src/cli/upgrade.ts:5`.
- **CLI dispatch for `upgrade`**: imports `runUpgrade`, passes `process.cwd()` and `argv.slice(1)`, writes stdout/stderr, exits with `result.exitCode` — `src/cli.ts:59-65`.
- **Help text entry**: `cycle upgrade` usage with all four flags and the "preserve user config by default" line — `src/cli.ts:129-131`.
- **`runInit` (the contrast / source of the dead-code overwrite behavior)**: unconditionally copies `workflows.yml`, recursively `cp`s `prompts`/`scripts`; its `force` param is unused — `src/cli/init.ts:7-34`.
- **`locateEngineBundle()`**: resolves `dist/cycle.js` from candidate paths; throws `"init: could not locate dist/cycle.js"` on failure — `src/cli/init.ts:36-46`.
- **`locateDefaultsDir()`**: resolves the shipped `defaults` dir from candidate paths; throws on failure — `src/cli/init.ts:48-62`.
- **Shipped defaults source**: `src/defaults/` contains `workflows.yml`, `prompts/`, `scripts/` (also `models.example.yml`) — kept in sync via `npm run sync-defaults`.
- **Coverage floor**: `"src/cli/upgrade.ts": 70` registered in the `FLOORS` table — `scripts/coverage-gate.mjs:22`.
- **CLAUDE.md command-table row** documenting the full semantics — `CLAUDE.md:33`.
- **`docs/upgrade.md`**: full user-facing doc covering the three contracts, flag matrix, clean-replace semantics, error behavior, idempotency — `docs/upgrade.md:1-99`.

### Existing Patterns to Follow

- **CLI subcommand result shape `{ exitCode, stdout, stderr }`**: shared by `runUpgrade` (`src/cli/upgrade.ts:5`) and `runCliCleanup` (`src/cli/cleanup.ts:28-30`). The dispatcher writes stdout, appends a newline to stderr, and `process.exit`s the code — `src/cli.ts:59-65` (upgrade), `src/cli.ts:89-95` (cleanup).
- **Unknown-flag guard before any I/O**: `argv.filter(a => a.startsWith("-") && !KNOWN_FLAGS.includes(a))` → exit 1 with `"Unknown flag(s): " + …` — identical idiom in `src/cli/upgrade.ts:25-29` and `src/cli/cleanup.ts:63`.
- **Source-location via candidate-path probing**: `locateEngineBundle`/`locateDefaultsDir` try each candidate with `stat`, return first hit, throw if none — `src/cli/init.ts:36-62`. `runUpgrade` calls these *after* its guards (`src/cli/upgrade.ts:52-53`) so their throws propagate uncaught (non-zero process exit).
- **Engine-artifact write idiom mirrored exactly from init**: `mkdir(.cycle/bin, recursive)` → `copyFile(enginePath, …)` → `chmod(…, 0o755)` → `writeFile(package.json, JSON.stringify({type:"module",private:true}, null, 2)+"\n")` — `src/cli/upgrade.ts:57-63` mirrors `src/cli/init.ts:12-23`. The package.json literal is byte-identical so always-refresh assertions hold.
- **Directory clean-replace**: `rm(dest, {recursive, force:true})` then `cp(src, dest, {recursive})`; single-file categories use plain `copyFile` — `src/cli/upgrade.ts:73-92`.
- **Lazy dispatch imports**: each subcommand is `await import()`ed inside its `argv[0]` branch rather than imported at top — `src/cli.ts:53,60,68,75,83,90,98,106`.
- **Failure handling (current approach in the change area)**:
  - Unknown flag → early return exit 1, no I/O — `src/cli/upgrade.ts:26-29`.
  - Uninitialized repo (`.cycle/` missing or non-directory) → `stat` in try/catch, throw-on-non-directory, catch returns exit 1 with message naming `cycle init`, before any write — `src/cli/upgrade.ts:39-48`.
  - Source-location failures → propagate uncaught (never wrapped in try/catch) — `src/cli/upgrade.ts:51-53`.
  - Per-category overwrite failures → `await`ed without local catch, so they raise rather than leave a half-copy unsurfaced — `src/cli/upgrade.ts:73-92`.
  - All guards run strictly before the first write so a rejected invocation never half-upgrades.
- **Observability**: `runUpgrade` is a one-shot CLI command — it does **not** emit `.cycle/log.jsonl` structured events (unlike the engine run loop). Its observability is the human-readable stdout summary listing Refreshed / Overwritten / Preserved / Untouched sections — `src/cli/upgrade.ts:94-109`. The summary always lists the engine refresh; conditionally lists overwritten and preserved categories; and always lists the untouched state files line. This matches the `cleanup.ts` convention of returning text rather than emitting log events.
- **Idempotency / retry-safety**: structural — always-refresh writes are overwrites by nature; the default-preserve path performs *no write* to user categories (`else` branches only push to the `preserved` array — `src/cli/upgrade.ts:76-78,89-91`); opt-in clean-replace uses `rm` with `force:true` (tolerates missing target) then `cp`, converging to the same end state on every run. State preservation is structural: no write path in the function ever names a state file (`src/cli/upgrade.ts:14-19` comment documents this invariant).

### Dependencies & Integration Points

- **`locateEngineBundle`, `locateDefaultsDir`**: imported from `./init.ts` — `src/cli/upgrade.ts:3`. These are the existing exported helpers the SPEC names as dependencies.
- **`node:fs/promises`**: `cp, mkdir, stat, chmod, copyFile, writeFile, rm` — `src/cli/upgrade.ts:1`.
- **`node:path` `join`** — `src/cli/upgrade.ts:2`.
- **`src/defaults/`**: the canonical source tree (`workflows.yml`, `prompts/`, `scripts/`) resolved through `locateDefaultsDir()`; kept in sync from source via `npm run sync-defaults`.
- **`dist/cycle.js`**: the built engine bundle resolved through `locateEngineBundle()`; produced by `npm run build` (esbuild bundle of `src/cli.ts`).
- **CLI entry point**: `src/cli.ts` dispatches on `argv[0] === "upgrade"` — `src/cli.ts:59`.
- **No external services or env vars** are involved (consistent with SPEC "Dependencies").

### Test Infrastructure

- **Test framework**: Node's built-in `node:test` runner with `--experimental-strip-types` (no transpile), `node:assert` strict mode — `tests/cli/upgrade.test.ts:1-2`. Consistent with the wider suite (`npm test` auto-builds first via `pretest`).
- **Test conventions**: real-filesystem temp dirs via `mkdtemp(join(tmpdir(), "cycle-test-"))`, wrapped in `try/finally` with `rm(root, {recursive, force:true})` cleanup — `tests/cli/upgrade.test.ts:49-61` (pattern repeated in every test). Follows the `init.ts`/`cleanup.ts` test conventions.
- **Shared seed helper**: `seedInitializedRepo(root)` runs `runInit`, user-edits the three config categories with sentinels, and writes sentinel state files; returns the paths — `tests/cli/upgrade.test.ts:19-39`. `assertStateUntouched(p)` verifies the four state sentinels byte-for-byte — `tests/cli/upgrade.test.ts:41-46`.
- **Sentinel constants** for each config category and state file — `tests/cli/upgrade.test.ts:9-15`.
- **Current coverage of the change area**: 11 tests covering — no-flags preserve-all (`:48`); always-refresh engine artifacts incl. mode `0o111` check and `#!/usr/bin/env node` shebang head (`:64`); `--overwrite-prompts` isolation (`:88`); `--overwrite-workflows` isolation (`:103`); `--overwrite-scripts` isolation (`:118`); `--overwrite-prompts` clean-replace removes stray file (`:133`); `--overwrite-all` (`:150`); uninitialized repo errors + no `.cycle/` created (`:165`); non-directory `.cycle` treated as uninitialized (`:181`); unknown flag errors + sentinels intact (`:193`). Per-file floor is 70% (`scripts/coverage-gate.mjs:22`).
- **Failure-path test coverage**: present — uninitialized-repo (asserts exit 1, stderr names `cycle init`, and `.cycle` absence via `ENOENT` rejection — `tests/cli/upgrade.test.ts:165-179`), non-directory `.cycle` (`:181-191`), and unknown-flag (asserts exit 1, stderr message, and sentinels untouched — `:193-206`).

## Code References
- `src/cli/upgrade.ts:20-110` — `runUpgrade`: the entire command (guards → engine refresh → per-category overwrite → summary).
- `src/cli/upgrade.ts:7-12` — `KNOWN_FLAGS` array.
- `src/cli/upgrade.ts:26-29` — unknown-flag guard (pre-I/O).
- `src/cli/upgrade.ts:39-48` — initialized guard (pre-write).
- `src/cli/upgrade.ts:52-53` — source location (throws propagate).
- `src/cli/upgrade.ts:57-65` — always-refresh engine artifacts + `refreshed` list.
- `src/cli/upgrade.ts:73-92` — per-category opt-in overwrite (single-file copy + dir clean-replace).
- `src/cli/upgrade.ts:94-109` — human-readable summary.
- `src/cli.ts:59-65` — `upgrade` dispatch branch.
- `src/cli.ts:129-131` — help text for `cycle upgrade`.
- `src/cli/init.ts:7-34` — `runInit` (the blind-overwrite first-run path; `force` is dead code).
- `src/cli/init.ts:36-62` — `locateEngineBundle` / `locateDefaultsDir`.
- `scripts/coverage-gate.mjs:12-39` — `FLOORS` table including `src/cli/upgrade.ts: 70`.
- `tests/cli/upgrade.test.ts:1-207` — full test file.
- `docs/upgrade.md:1-99` — user-facing documentation.
- `CLAUDE.md:33` — command-table row.

## Open Questions
- The full SPEC deliverable (source, dispatch, help, tests, docs, coverage floor, CLAUDE.md row) is already present and committed at HEAD (`bf15019`); `git ls-files` confirms all artifacts are tracked and `git status` shows them clean. The planner must determine whether this cycle's intended work is (a) to re-build the feature from scratch per the re-queue instruction (the issue says "Build this cleanly from scratch… IGNORE [the stash] and build fresh"), (b) to verify/harden the existing committed implementation, or (c) to reconcile against the stashed WIP. The research records facts only; this disposition is the plan step's to resolve.
- The SPEC "Documentation Updates" also mentions `README.md` surfacing `cycle upgrade`; whether the root README currently references the command was not confirmed in this pass and should be checked during planning.
