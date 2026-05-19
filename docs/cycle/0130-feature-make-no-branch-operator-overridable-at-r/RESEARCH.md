Now I have everything needed. Writing the research document.

```markdown
# Research: Cycle 0130

## Cycle Context

Add `CYCLE_TRUNK_BASED=1` env var and `--trunk` CLI flag that override `engine.commit.mode` to `"trunk"` at engine bootstrap, without editing `workflows.yml`. After the change, `src/defaults/workflows.yml` ships `mode: worktree-pr` (consumer default), this repo runs trunk-based via `.cycle/.env`, and the two YAML files become byte-identical so `sync-defaults` can overwrite safely.

## Current Codebase State

### Relevant Components

- **`loadConfig`** — reads `.cycle/workflows.yml`, validates structure, normalizes `engine.commit` to `CommitConfig`, returns `CycleConfig`. No env var override logic exists today. Override injection point is line 84 (`parsed.engine.commit = commitConfig`) before the `return parsed` at line 85 — `src/engine/workflow.ts:44-86`
- **`CommitConfig` type** — `{ mode: "trunk" | "local-only" | "worktree-pr"; push: boolean }` — `src/engine/workflow.ts:13-16`
- **`RunArgs` type** — `{ command, text, workflow, dryRun, noSkipCompleted }` — no `trunk` field — `src/cli/parse-args.ts:3-9`
- **`parseArgs`** — parses `run` command with `--workflow`, `--dry-run`, `--no-skip-completed`; no `--trunk` flag — `src/cli/parse-args.ts:57-76`
- **`RunOneArgs` type** — `{ cycleId, issueId, title, workflow, attempt, skipCompletedOnRetry, baseBranch?, resumeFromStep? }` — no `trunk` field — `src/cli/run-one.ts:3-12`
- **`parseRunOneArgs`** — manual switch-based parser; processes `--cycle-id`, `--issue-id`, `--title`, `--workflow`, `--attempt`, `--skip-completed-on-retry`, `--base-branch`, `--resume-from-step` — `src/cli/run-one.ts:14-67`
- **`runOne`** — calls `runCycle(cwd, params)` directly — `src/cli/run-one.ts:71-96`
- **`spawnRunOne`** — supervisor spawns inner runner; args array built from `RunOneParams` fields; env set via `buildChildEnv({})` which inherits `process.env` — `src/cli.ts:174-196`
- **`buildChildEnv`** — line 26: `return { ...process.env, ...extra, PATH: path }` — env vars already in `process.env` (including `CYCLE_TRUNK_BASED`) propagate to inner runner automatically — `src/engine/child-env.ts:16-27`
- **`runCycle`** — calls `loadConfig(repoRoot)` at line 99; uses `cfg.engine.commit.mode` at four sites — `src/engine/run-cycle.ts:95-290`
- **`src/defaults/workflows.yml`** — currently declares `mode: trunk` (line 5); missing `document` workflow — `src/defaults/workflows.yml`
- **`.cycle/workflows.yml`** — currently declares `mode: trunk` (line 5); has "LOCAL DIVERGENCE" comment block (lines 13-18); has `document` workflow (lines 34-41) not present in defaults

### Branch-gate sites in `run-cycle.ts`

All four read `cfg.engine.commit.mode` post-`loadConfig`:

| Line | Guard | Effect |
|------|-------|--------|
| 112 | `mode !== "worktree-pr"` | resume path: trunk uses `prepareTrunkArtifactDir`, worktree uses `checkoutCycleBranch` |
| 119 | `mode !== "worktree-pr"` | fresh start: trunk uses `prepareTrunkArtifactDir`, worktree uses `createCycleBranch` |
| 179 | `mode === "worktree-pr"` | reset-eligible steps: HEAD SHA capture + branch reset only in worktree-pr mode |
| 265 | `mode !== "worktree-pr"` | finally block: trunk emits `cycle.checkout {status: "skipped", reason: "trunk"}`; worktree calls `checkoutBase` |

### Existing Patterns to Follow

- **Config normalization in `loadConfig`**: override stamped at line 84 (`parsed.engine.commit = commitConfig`) before return — same location is the natural place to stamp trunk override: `src/engine/workflow.ts:70-85`
- **Boolean flag parsing in `parseRunOneArgs`**: `--skip-completed-on-retry` is a boolean flag (no value), toggled by presence — `src/cli/run-one.ts:45-46`; pattern to follow for `--trunk`
- **Conditional arg push in `spawnRunOne`**: `if (params.skipCompletedOnRetry) args.push("--skip-completed-on-retry")` — `src/cli.ts:182`; same pattern for forwarding `--trunk`
- **env cleanup in tests**: tests that touch `process.env.CYCLE_BASE` save/restore the value — `tests/engine/run-cycle.base-branch.test.ts:72-81`; same pattern needed for `CYCLE_TRUNK_BASED` tests
- **`RunOneParams` vs `RunOneArgs`**: `RunOneParams` is the internal type in `cli.ts` (lines 163-172); `RunOneArgs` is the public type in `run-one.ts` (lines 3-12); both need the `trunk` field if the flag path is used

### Dependencies & Integration Points

- `loadConfig` is called in **two places**:
  1. `src/cli.ts:96` — supervisor reads config once; result is `cfg` used throughout drain loop
  2. `src/engine/run-cycle.ts:99` — inner runner re-reads config independently on each cycle
- Since `runCycle` calls `loadConfig` internally, the override **must be applied inside `loadConfig`** (or the env var approach works automatically because `buildChildEnv` inherits `process.env`)
- With `--trunk` CLI flag: supervisor sets `CYCLE_TRUNK_BASED=1` in its env (or stamps the cfg object), and forwards `--trunk` to `spawnRunOne` args so inner runner can apply the same override when it calls `loadConfig`
- `src/engine/workflow.ts` is imported by: `src/cli.ts` (line 18), `src/engine/run-cycle.ts` (line 2), `src/cli/triage.ts`, `src/engine/triage.ts`

### YAML File Divergence Details

Current `src/defaults/workflows.yml`:
- `engine.commit.mode: trunk` (line 5)
- Has: `feature`, `quickfix`, `e2e-tests` workflows (45 lines total)
- Missing: `document` workflow

Current `.cycle/workflows.yml`:
- `engine.commit.mode: trunk` (line 5)
- Has divergence comment block lines 13-18
- Has: `feature`, `document`, `quickfix`, `e2e-tests` workflows (61 lines total)

After this cycle, both files should declare `mode: worktree-pr` and include the `document` workflow.

### `.cycle/.env` Status

File does not exist. `.gitignore` does not mention `.cycle/.env` — it lists `log.jsonl`, `tbd.jsonl`, `cycle.pid`, `.sync-state.json`, `coverage.lcov`. File would be committed (or must be added to `.gitignore` if not committing).

### Test Infrastructure

- **Framework**: Node.js built-in `node:test` with `node:assert/strict`
- **Directories**: `tests/engine/`, `tests/cli/`, `tests/defaults/`, `tests/dogfood/`
- **Convention**: `mkdtemp` + real filesystem, save/restore `process.env` values in try/finally, `rm -rf` cleanup
- **Relevant test files**:
  - `tests/engine/workflow.test.ts` — unit tests for `loadConfig`/`loadWorkflow`; tests commit mode parsing (lines 202-278); new env override tests go here
  - `tests/cli/parse-args.test.ts` — unit tests for `parseArgs`; new `--trunk` tests go here
  - `tests/cli/run-one.test.ts` — unit tests for `parseRunOneArgs` + integration tests via `dist/cycle.js`
  - `tests/engine/run-cycle.base-branch.test.ts` — integration tests for `runCycle` with real git repos; resume + trunk override test goes here or in `tests/engine/run-cycle.test.ts`
  - `tests/dogfood/feature-yaml.test.ts` — **WILL BREAK**: line 26 asserts `y.engine?.commit?.mode === "trunk"`; must be updated to `"worktree-pr"` after YAML change

### Coverage Gate

`scripts/coverage-gate.mjs` FLOORS table (line 12-19):
- `src/engine/workflow.ts` — **NOT in FLOORS table** (aggregate coverage only)
- `src/cli/parse-args.ts` — **NOT in FLOORS table**
- `src/cli/run-one.ts` — floor 70%
- Aggregate thresholds from CLAUDE.md: line ≥ 95%, branch ≥ 75%, function ≥ 90%

## Code References

- `src/engine/workflow.ts:44-86` — `loadConfig` function; override injection point at line 84
- `src/engine/workflow.ts:13-16` — `CommitConfig` type
- `src/cli/parse-args.ts:3-9` — `RunArgs` type (needs `trunk?: boolean`)
- `src/cli/parse-args.ts:57-76` — `run` command parser (needs `--trunk` boolean option)
- `src/cli/run-one.ts:3-12` — `RunOneArgs` type (needs `trunk?: boolean`)
- `src/cli/run-one.ts:14-67` — `parseRunOneArgs` (needs `--trunk` case)
- `src/cli/run-one.ts:71-96` — `runOne`; calls `runCycle` directly
- `src/cli.ts:96` — `loadConfig(cwd)` call; after this, cfg is used
- `src/cli.ts:174-196` — `spawnRunOne`; builds args + calls `buildChildEnv({})`
- `src/cli.ts:182` — conditional arg push pattern for `skipCompletedOnRetry`
- `src/engine/run-cycle.ts:99` — inner `loadConfig` call
- `src/engine/run-cycle.ts:112,119,179,265` — four `commit.mode` branch gates
- `src/engine/child-env.ts:26` — `{ ...process.env, ...extra }` — env var inheritance
- `tests/dogfood/feature-yaml.test.ts:26` — asserts `mode === "trunk"`; must be updated
- `tests/engine/run-cycle.base-branch.test.ts:72-81` — `process.env.CYCLE_BASE` save/restore pattern

## Open Questions

1. **Override application site**: SPEC says override lives in `loadConfig` (or thin caller wrapper). Should `loadConfig` read `process.env.CYCLE_TRUNK_BASED` directly, or should the caller (cli.ts / run-one.ts) stamp the returned object? Direct read inside `loadConfig` is simpler and automatically covers both call sites; stamping in caller requires touching two call sites but keeps `loadConfig` pure. Planner should decide.

2. **`--trunk` → inner runner propagation**: SPEC allows either (a) env var inheritance (supervisor sets `CYCLE_TRUNK_BASED=1` in its process env before spawning, so `buildChildEnv` carries it) or (b) explicit `--trunk` arg in `spawnRunOne`. Option (a) requires the supervisor to `process.env.CYCLE_TRUNK_BASED = "1"` when flag is set; option (b) requires the inner runner to parse `--trunk` and apply it. Both are plausible — planner should pick one.

3. **`.cycle/.env` committed or gitignored**: `.gitignore` does not list `.cycle/.env`. The file should be committed so `cycle init --upgrade` doesn't need special handling. Planner should confirm and potentially update `.gitignore` to NOT ignore it (or verify it's already safe to commit).

4. **`tests/dogfood/feature-yaml.test.ts:26`**: After `mode: trunk` → `mode: worktree-pr` in both YAML files, this assertion breaks. The assertion must change to `"worktree-pr"`. Planner should include this update explicitly.

5. **Comment block in defaults YAML**: SPEC says add a top-level comment documenting the override mechanism in `src/defaults/workflows.yml`. No existing comment block convention exists in defaults — the current file has no comments. Content and placement need to be defined.
```
