I have sufficient context to write the research document.

```markdown
# Research: Cycle 0029

## Cycle Context
This cycle adds a new first-class `cycle upgrade` command (`src/cli/upgrade.ts` exporting `runUpgrade`) that refreshes the engine bundle in an already-initialized repo without destroying user customizations. Today the only way to refresh is re-running `cycle init`, whose `runInit` unconditionally overwrites `.cycle/workflows.yml`, `.cycle/prompts/**`, and `.cycle/scripts/**`. `cycle upgrade` must ALWAYS refresh the never-edited engine artifacts (`.cycle/bin/cycle.js`, `.cycle/package.json`), DEFAULT-PRESERVE the three user-editable config categories, overwrite each category only under its own flag (`--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, `--overwrite-all`), NEVER touch state files (`.cycle/.env`, `.cycle/tbd.jsonl`, `.cycle/log.jsonl`, `docs/cycle/issues/**`), error if the repo is not initialized, error on unknown flags, and print a concise refreshed/preserved summary. The command must be wired into `src/cli.ts` dispatch, documented in `cycle help`, README, and a new `docs/upgrade.md`, and gated by a per-file coverage floor (~70%).

## Current Codebase State

### Relevant Components
- `runInit` — the structural template to mirror; performs unconditional scaffolding/overwrite — `src/cli/init.ts:7-34`
- `locateEngineBundle` — resolves `dist/cycle.js` from a candidate list; throws `"init: could not locate dist/cycle.js"` on failure — `src/cli/init.ts:36-46`
- `locateDefaultsDir` — resolves the `defaults` dir (workflows.yml, prompts, scripts) from a candidate list; throws on failure — `src/cli/init.ts:48-62`
- `HERE` module-dir anchor used by both locators — `src/cli/init.ts:5`
- CLI top-level command dispatch (sequential `if (argv[0] === ...)` branches, each dynamically `import`ing its handler and calling `process.exit`) — `src/cli.ts:46-131`
- The `init` dispatch branch (closest analog to wire) — `src/cli.ts:51-56`
- `cycle help` usage block (string literal printed to console) — `src/cli.ts:109-131`
- `cleanup.ts` — the cited mirror for a CLI command returning `{ exitCode, stdout, stderr }`, with unknown-flag handling — `src/cli/cleanup.ts`
- Shipped defaults source tree: `src/defaults/workflows.yml`, `src/defaults/prompts/**` (18 `.md` files), `src/defaults/scripts/**` (`verify.sh`) — synced into `.cycle/` via `npm run sync-defaults`

### Existing Patterns to Follow
- **Engine-artifact write pattern**: `mkdir(".cycle/bin", {recursive})` → `copyFile(enginePath, ".cycle/bin/cycle.js")` → `chmod(..., 0o755)`; `.cycle/package.json` is written via `writeFile` with `JSON.stringify({ type: "module", private: true }, null, 2) + "\n"` (NOT copied from defaults) — `src/cli/init.ts:12-23`. The SPEC's "match the shipped … package.json (always refreshed)" criterion must reproduce this exact literal.
- **Category copy pattern**: workflows via `copyFile(join(defaults,"workflows.yml"), ...)`; prompts/scripts via `cp(join(defaults, "prompts"|"scripts"), dest, { recursive: true })` — `src/cli/init.ts:27-29`. `cp` recursive does not pre-clear the destination, so the planner must decide whether overwrite means merge-over vs. clean-replace.
- **Imports available in init**: `cp, mkdir, stat, chmod, copyFile, writeFile` from `node:fs/promises` — `src/cli/init.ts:1`.
- **CLI handler signature conventions**: two coexisting styles — (a) `runInit({ targetRoot, force })` mutating the filesystem and returning void, dispatched then `process.exit(0)` (`src/cli.ts:51-56`); (b) `runCliCleanup(cwd, argv) => { exitCode, stdout, stderr }` where the dispatcher writes streams and exits with the returned code (`src/cli.ts:80-86`, `src/cli/cleanup.ts:126-152`). The SPEC names `runUpgrade({ targetRoot, flags })`; the dispatcher must translate its result/error into stream output + exit code.
- **Unknown-flag handling**: `cleanup` filters argv for tokens starting with `-` not in an allowlist and returns `exitCode:1` with `"Unknown flag(s): " + joined` — `src/cli/cleanup.ts:59-64`. This is the established convention the SPEC's "unknown flag is reported as an error" requirement should match.
- **Failure handling**: `locate*` helpers throw plain `Error`s that propagate uncaught (no try/catch in `runInit`) → process exits non-zero — `src/cli/init.ts:42-45,58-61`. The SPEC requires this propagation to be preserved (bundle/defaults not located → throw → non-zero exit). Init does no pre-existence check; the SPEC adds a new requirement that `runUpgrade` must detect a missing `.cycle/` and surface a clear error directing the user to `cycle init`, writing no files. No equivalent guard exists in `init.ts` today.
- **Observability**: `init.ts` emits NO log events and prints nothing (silent). `cleanup` returns JSON payloads via stdout, not `.cycle/log.jsonl`. The SPEC requires `cycle upgrade` to print a concise human-readable summary; there is no existing structured-event or logging convention this command must hook into (the engine `log.emit`/`.cycle/log.jsonl` machinery in `src/cli.ts:178-189` is engine-run scope, not init/upgrade scope).
- **Idempotency / retry-safety**: `init`/`cleanup` acquire no engine lock; the PID-lockfile `acquireLock`/`releaseLock` (`src/cli.ts:167-174`) guards only the queue-drain run path, not one-shot subcommands. `init` is inherently re-runnable (overwrites). No dedup keys or guards apply to `upgrade`; safety here is the SPEC's "never touch state / default-preserve" contract, not a lock.

### Dependencies & Integration Points
- `src/cli.ts` dispatch chain — must add a new `if (argv[0] === "upgrade")` branch (mirror `init` at `src/cli.ts:51-56`), parsing the overwrite flags and `process.cwd()` as `targetRoot`/root.
- `src/cli.ts:109-131` help block — must list `cycle upgrade` and the four flag strings (`--overwrite-prompts`, `--overwrite-workflows`, `--overwrite-scripts`, `--overwrite-all`).
- `src/cli/init.ts` `locateEngineBundle` / `locateDefaultsDir` — currently module-private (not exported). SPEC says reuse rather than duplicate; the planner must export them (or extract to a shared module) — both reference `HERE` (`src/cli/init.ts:5`) computed from `init.ts`'s own `import.meta.url`, which must stay valid if relocated.
- `src/defaults/` (workflows.yml, prompts/**, scripts/**) — the overwrite source; kept in sync with `.cycle/` via `scripts/sync-defaults.mjs` (`npm run sync-defaults`).
- `scripts/coverage-gate.mjs` `FLOORS` table — add `"src/cli/upgrade.ts": 70` (mirroring `"src/cli/cleanup.ts": 70` at `scripts/coverage-gate.mjs:21`).

### Test Infrastructure
- **Test framework**: Node built-in `node:test` + `node:assert` (strict), no transpile step (`--experimental-strip-types`). Tests live in `tests/cli/*.test.ts`.
- **Test conventions**: `init.test.ts` is the direct template — `mkdtemp(join(tmpdir(), "cycle-test-"))` per test, call `runInit` against the temp root, assert with `stat`/`readFile`, teardown via `rm(root, { recursive: true, force: true })` in `finally` — `tests/cli/init.test.ts:8-38`. Exec-bit asserted via `(sb.mode & 0o111) !== 0` and shebang regex (`tests/cli/init.test.ts:13-16`); `package.json` parsed and `pkg.type === "module"` asserted (`tests/cli/init.test.ts:18-19`).
- **CLI-level / help tests**: `help.test.ts` spawns the built `dist/cycle.js` via `spawnSync`, asserts exit 0 and substring presence. The test `"usage output lists all six subcommands"` iterates `["run","drop","status","triage","cleanup","help"]` and asserts each appears in `cycle help` output — `tests/cli/help.test.ts:74-81`. Adding `upgrade` to the help block is compatible but this list is a hardcoded set a planner should be aware of; a separate assertion for the new flag strings would follow the `compress-output` single-subcommand test pattern (`tests/cli/help.test.ts:83-88`). `ensureDist()` reads `dist/cycle.js`, so the bundle must be built (`pretest` builds it).
- **`mock.method` caveat**: `node:fs/promises` cannot be stubbed via `mock.method` (non-configurable ESM exports); use real temp-dir filesystem manipulation, which is exactly what `init.test.ts` does (CLAUDE.md → Test conventions). The SPEC's testing strategy already mandates real temp dirs.
- **Current coverage of the change area**: `init.ts` is exercised only by the single `init.test.ts` happy-path test; it has no per-file floor today. `cleanup.ts` (the structural mirror) is gated at 70% and has `tests/cli/cleanup.test.ts`.
- **Failure-path test coverage**: No failure-path tests exist for `init.ts` (no bundle-not-located, no defaults-not-located tests). `cleanup.test.ts` exercises unknown-flag and dirty-tree error paths and is the closest existing model for failure-case CLI tests. The SPEC requires new failure-path tests (uninitialized repo, unknown flag, locate propagation) — none of these patterns are currently asserted against `init`/`upgrade`.

## Code References
- `src/cli/init.ts:7-34` — `runInit`: unconditional scaffold (engine bin+chmod, package.json literal, workflows copyFile, prompts/scripts recursive cp, issue dirs). Dead `force` param declared but unused (`opts.force` never read).
- `src/cli/init.ts:36-46` — `locateEngineBundle` candidate list + throw.
- `src/cli/init.ts:48-62` — `locateDefaultsDir` candidate list + throw.
- `src/cli.ts:51-56` — `init` dispatch branch (reads `--force` from argv, calls `runInit`, exits 0).
- `src/cli.ts:80-86` — `cleanup` dispatch branch (result-object → stream writes → `process.exit(result.exitCode)`).
- `src/cli.ts:109-131` — `cycle help` usage string literal.
- `src/cli/cleanup.ts:59-64` — unknown-flag detection/reporting convention.
- `src/cli/cleanup.ts:126-152` — `runCliCleanup` wiring of deps + result object.
- `scripts/coverage-gate.mjs:12-37` — `FLOORS` table (add `src/cli/upgrade.ts`).
- `tests/cli/init.test.ts:8-38` — temp-dir scaffolding/assertion template.
- `tests/cli/help.test.ts:74-88` — subcommand-list and single-subcommand help assertions.
- `README.md:80-91` — "What ships into a repo" (lists the artifacts `upgrade` touches).
- `README.md:93-132` — "Quick start" (init/run usage; the new "Upgrading" section belongs adjacent).
- `docs/sync-defaults.md` — existing doc explaining `src/defaults/` → `.cycle/` sync (relevant to where shipped defaults come from).

## Open Questions
- **Are `locateEngineBundle` / `locateDefaultsDir` exported or extracted?** They are currently module-private in `init.ts`; the planner must decide between exporting from `init.ts` (keeps `HERE` anchored there) vs. extracting to a shared module (and re-anchoring `HERE`). The SPEC says reuse, not duplicate.
- **Overwrite semantics for directory categories** (`prompts/`, `scripts/`): does an opt-in overwrite clean-replace the destination dir first, or `cp`-merge over it (init's current behavior leaves stale user-added files in place)? The SPEC says "replace … with shipped defaults" — the planner must define whether stale files are removed.
- **`runUpgrade` return contract vs. dispatcher**: SPEC names `runUpgrade({ targetRoot, flags })` but does not specify whether it returns a result object (like `cleanup`) or throws/exits (like `init`). The "writes no files on uninitialized repo" and "summary print" requirements interact with this choice.
- **What exactly defines "initialized"** for the missing-`.cycle/` guard — presence of the `.cycle/` directory, or of specific files (`.cycle/bin/cycle.js`)? SPEC text says "no `.cycle/` directory present."
- **CLAUDE.md / AGENTS.md updates**: SPEC's Documentation Updates names AGENTS.md, but no `AGENTS.md` exists at the repo root (only `CLAUDE.md`). The planner must confirm whether to add the Commands-table row to `CLAUDE.md` only.
- **`force` param of `runInit`**: SPEC lists retiring it as optional/out-of-scope; planner should confirm it is left untouched.
```
