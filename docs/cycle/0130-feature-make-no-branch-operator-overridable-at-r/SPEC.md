Now I have full context. Writing the spec.

```markdown
# SPEC — Cycle 0130: Runtime `no_branch` Override via Env Var

## Objective
Add a `CYCLE_TRUNK_BASED=1` environment variable (and matching `--trunk` CLI flag) that overrides `engine.commit.mode` to `"trunk"` at engine bootstrap, without touching `workflows.yml`. This eliminates the permanent divergence between `src/defaults/workflows.yml` and `.cycle/workflows.yml`: defaults can ship `mode: worktree-pr` (the correct consumer default) while this dogfood repo runs trunk-based via `.cycle/.env`. After this cycle, `sync-defaults` can safely overwrite `.cycle/workflows.yml` because the two files are byte-identical on commit-mode.

## Source Issue
`refl-0046-sync-defaults-clobbers-local-trunk-based-no-branch-runtime-override` — "Make `no_branch` operator-overridable at runtime to eliminate `.cycle/workflows.yml` divergence"

## Scope

### In Scope
- `CYCLE_TRUNK_BASED=1` env var read once at engine bootstrap; stamps `cfg.engine.commit.mode = "trunk"` on the loaded config object.
- `--trunk` CLI flag on `cycle run` (and forwarded to `run-one` subprocess) overrides the same field; CLI flag wins over env var.
- `src/defaults/workflows.yml` updated: `engine.commit.mode` changed to `worktree-pr`; `document` workflow added so the file matches `.cycle/workflows.yml` content.
- `.cycle/workflows.yml` updated to match `src/defaults/workflows.yml` byte-for-byte (comment block removed; commit mode set to `worktree-pr`).
- `.cycle/.env` created with `CYCLE_TRUNK_BASED=1` so this repo continues to run trunk-based after sync.
- CLAUDE.md "Workflow style" section updated to document the override mechanism.
- Tests: env-var override path covered; existing branch-based tests unaffected; resume path under override covered.

### Out of Scope
- Migrating other per-repo divergences (prompts, scripts).
- Changing the `--trunk` flag behavior for any workflow other than `feature` (all workflows share `engine.commit.mode`; that is by design).
- `cycle init --trunk` bootstrap flag (deferred; env var + `.cycle/.env` covers the need).
- The sibling `guard-sync-defaults-against-divergent-files` issue — do not delete or disable it.

## Requirements
- `CYCLE_TRUNK_BASED=1` in the process environment must cause `cfg.engine.commit.mode` to be `"trunk"` regardless of what `workflows.yml` declares.
- `--trunk` flag passed to `cycle run` must have the same effect and take precedence over the env var.
- The override must be stamped on the config object before any consumer (cli.ts, run-one.ts, runCycle) reads `cfg.engine.commit.mode`. Reading happens in `loadConfig` (or immediately after in a thin wrapper) so child subprocess inherits via env rather than requiring a re-read.
- `run-one` subprocess must receive the override: either via env var inheritance (if `CYCLE_TRUNK_BASED` is set in the calling environment) or via an explicit `--trunk` arg forwarded through `spawnRunOne`.
- When override is inactive (no env var, no flag), behavior is unchanged: consumer repos get `worktree-pr` from the updated default, branch/PR behavior is identical to today.
- Resume path: when override is active and mode resolves to `"trunk"`, the `isResetEligible && mode === "worktree-pr"` guard in run-cycle.ts already skips HEAD SHA capture/reset. No new logic required there — just verify it works correctly under the override.
- Coverage must not decrease vs baseline.

## Acceptance Criteria
- [ ] With `CYCLE_TRUNK_BASED=1` set, `loadConfig` (or its caller) returns `cfg.engine.commit.mode === "trunk"` even when `workflows.yml` declares `worktree-pr`.
- [ ] With `--trunk` CLI flag, same result; flag beats env var.
- [ ] With neither set and `workflows.yml` declaring `worktree-pr`, `cfg.engine.commit.mode === "worktree-pr"` — branch-based default unchanged.
- [ ] `src/defaults/workflows.yml` declares `mode: worktree-pr` and includes the `document` workflow.
- [ ] `.cycle/workflows.yml` is byte-identical to `src/defaults/workflows.yml` (no divergence comment block, same commit mode).
- [ ] `.cycle/.env` exists with `CYCLE_TRUNK_BASED=1`.
- [ ] CLAUDE.md "Workflow style" section documents the `CYCLE_TRUNK_BASED` / `--trunk` mechanism and `.cycle/.env` as the persistence point.
- [ ] Test covers: env var override → mode is trunk; no-override → mode is worktree-pr from YAML; CLI flag override → mode is trunk; resume path under trunk override does not attempt branch checkout or HEAD SHA capture.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.
- [ ] Coverage thresholds held (line ≥ 95%, branch ≥ 75%, function ≥ 90%; per-file floors in coverage-gate.mjs).

## Testing Strategy
- Unit tests for the override resolution logic (test `loadConfig` or the wrapper with a temp `workflows.yml` declaring `worktree-pr` + env var set → assert mode is `trunk`).
- Test for CLI flag path: `spawnRunOne` args include `--trunk` when flag is active; or verify the flag is parsed and stamped correctly in isolation.
- Resume-path test: confirm that when mode is `trunk` (via override), run-cycle skips `checkoutCycleBranch` and `resetCycleBranchTo` on a reset-eligible step — existing run-cycle tests may already cover this via commit-mode assertion; add a case with the worktree-pr YAML + trunk override.
- All existing tests (462 currently passing) must continue to pass without modification.

## Documentation Updates
- **CLAUDE.md**: "Workflow style" section — add note that trunk-based operation is enforced via `CYCLE_TRUNK_BASED=1` in `.cycle/.env`, not via `workflows.yml`; point readers at the env var / `--trunk` flag for any repo needing trunk mode.
- **`src/defaults/workflows.yml`**: top-level comment block documenting the override mechanism and pointing trunk-based repos at `CYCLE_TRUNK_BASED=1`.
- **`.cycle/workflows.yml`**: same top-level comment block (from defaults); no local divergence comment.

## Dependencies
- `src/engine/workflow.ts` `loadConfig` — the apply-override logic lives here or in a thin caller wrapper.
- `src/cli/parse-args.ts` — `--trunk` flag must be added to `RunArgs` and parsed.
- `src/cli.ts` — apply override after `loadConfig`; forward `--trunk` into `spawnRunOne` args.
- `src/cli/run-one.ts` — accept and apply `--trunk` flag (or rely on env var inheritance through `buildChildEnv`).
- `.cycle/.env` — must be gitignored or committed; check `.gitignore` and decide; recommend committing so `cycle init --upgrade` does not clobber it.
```
