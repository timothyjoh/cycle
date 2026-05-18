# SPEC — Cycle 0119: Remove Untracked Files in `resetCycleBranchTo`

## Objective
Add a `git clean -fd` call after `git reset --hard` in `resetCycleBranchTo` so that the working tree after a build/fix restart is byte-equivalent to a fresh checkout at the captured pre-step SHA. Without this, aborted attempts leave untracked debris (scratch files, gitignored artifacts, partial codegen output) that silently contaminates the retry, violating the determinism guarantee the restart policy advertises.

## Source Issue
`refl-0041-hard-reset-leaks-untracked-files-across-clean-untracked-on-reset` — "Remove untracked files in `resetCycleBranchTo` so build/fix restart is truly deterministic"

## Scope

### In Scope
- Add `git clean -fd` after `git reset --hard` in `resetCycleBranchTo`, gated behind the existing `cycle/` branch guard
- Surface clean failures as warnings (same pattern as existing reset failure path)
- Add test coverage: untracked file removed after reset, branch guard blocks clean, gitignored file survives `-fd`

### Out of Scope
- Broadening restart policy to steps beyond `build` and `fix`
- Using `-fdx` (removing gitignored paths like `dist/`, `node_modules/`, `.cycle/`)
- Changes to step prompts, workflow YAML, or warning taxonomy for `*_pre_sha_missing` / `*_pre_sha_unreachable`
- `no_branch: true` workflows (already skip the entire capture/reset/clean path)

## Requirements
- `resetCycleBranchTo` must run `git clean -fd` after a successful `git reset --hard`, and only when HEAD is on a `cycle/…` branch (same guard as reset)
- Use `-fd` not `-fdx`: gitignore-listed paths (`dist/`, `node_modules/`, `.cycle/`) are engine working state and must not be wiped mid-run
- A non-zero exit from `git clean` must surface as a warning, not silently swallowed
- Guard + reset + clean must remain a single atomic code path — no way to reset without cleaning
- A code comment must capture the `-fd` vs `-fdx` rationale inline

## Acceptance Criteria
- [ ] `resetCycleBranchTo` calls `git clean -fd` after `git reset --hard` when on a `cycle/` branch
- [ ] Non-zero exit from `git clean` produces an observable warning (does not throw, does not silently continue)
- [ ] When HEAD is not on a `cycle/` branch, function throws before reset or clean; untracked files are untouched
- [ ] A gitignored file (e.g. `dist/foo.js`) survives the clean, confirming `-fd` semantics
- [ ] Existing Test C (`resume at fix hard-resets…`) still passes with the new clean call added
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Framework: Node native test runner (existing pattern in `tests/engine/`)
- Additive assertions on existing build/fix restart tests where possible; new test cases for branch guard and gitignored survival
- Key scenarios:
  1. **Build step**: seed untracked file on cycle branch, call `resetCycleBranchTo`, assert file is gone and tracked files are reset
  2. **Fix step**: same shape parameterized on `step.name = fix`
  3. **Branch guard**: call `resetCycleBranchTo` while HEAD is on `master` with untracked file present; assert throws and file still exists
  4. **Gitignored survival**: seed `dist/foo.js` (matches `.gitignore`), call `resetCycleBranchTo`, assert file survives
- No new test files required if existing restart-policy test file can absorb the new cases

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No command or convention changes — internal engine plumbing only
- **docs/ENGINE.md**: Update the restart policy section to note that `resetCycleBranchTo` now also runs `git clean -fd` after the hard reset, with rationale for `-fd` vs `-fdx`

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `resetCycleBranchTo` implementation in `src/engine/` (the branch guard and reset call already exist)
- `git clean` available in the runtime environment (already assumed by the engine's `git` dependency)
