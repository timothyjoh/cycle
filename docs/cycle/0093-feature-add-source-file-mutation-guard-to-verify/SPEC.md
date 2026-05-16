# SPEC — Cycle 0093: Source-File Mutation Guard in verify.sh

## Objective
Add a pre-check to `verify.sh` that exits non-zero when a cycle branch has made no changes outside `docs/cycle/` relative to the base commit. This closes the false-positive drain path where build/fix agents write only artifact prose (BUILD.md, FIX.md) into `docs/cycle/<id>/` and the engine records `cycle.end status:ok` with zero source files touched.

## Source Issue
`refl-0087-build-and-fix-steps-accept-permissions-r-verify-source-mutation-guard` — "Add source-file mutation guard to verify step (exit non-zero when only docs/cycle/ changed)"

## Scope

### In Scope
- Add the `git diff --name-only "$BASE"...HEAD` guard to `src/defaults/scripts/verify.sh`, placed before the test-runner dispatch block.
- Mirror the same change to `.cycle/scripts/verify.sh` via `npm run sync-defaults`.
- Add test assertions in `tests/defaults/scripts.test.ts` covering the new guard logic (static source-text checks).

### Out of Scope
- Modifying the verify step prompt or workflow YAML.
- Adding integration tests that run `verify.sh` in a real git repo.
- Changing how `CYCLE_BASE` is set or passed — it already exists in the environment.

## Requirements
- The guard must run before any test invocation so it fails fast with a clear message.
- Filter expression must exclude exactly `^docs/cycle/` — no broader exclusion.
- `CYCLE_BASE` env var used as base ref; fallback to `master` if unset or empty.
- Failure message written to stderr, not stdout.
- Exit code 1 on guard failure (consistent with test runner failures).
- All existing tests continue to pass.
- `src/defaults/scripts/verify.sh` and `.cycle/scripts/verify.sh` must be byte-identical after `npm run sync-defaults`.

## Acceptance Criteria
- [ ] `verify.sh` exits 1 with a stderr message when `git diff --name-only $BASE...HEAD` produces only `docs/cycle/`-prefixed paths.
- [ ] `verify.sh` exits 1 with the same message when `git diff --name-only $BASE...HEAD` produces no paths at all.
- [ ] `verify.sh` exits 0 and continues to the test-runner block when at least one non-`docs/cycle/` path is changed.
- [ ] The guard uses `BASE="${CYCLE_BASE:-master}"` for the ref.
- [ ] The stderr message contains the text `"no src changes"` and names the base ref.
- [ ] `tests/defaults/scripts.test.ts` has at least two new assertions: one that the guard pattern is present, one that `CYCLE_BASE` fallback is present.
- [ ] `npm test` passes on master after the change.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node native test runner (`node:test`), consistent with the rest of the suite.
- Static source-text assertions in `tests/defaults/scripts.test.ts` (same pattern as existing `verify.sh installs deps` test): read the script as a string and assert key patterns are present with `assert.match`.
- Key assertions:
  - Guard block is present: `/git diff --name-only/`
  - `docs/cycle/` filter present: `/docs\/cycle\//`
  - `CYCLE_BASE` env var with fallback: `/CYCLE_BASE:-master/`
  - Stderr redirect on failure: `/>&2/` or `/\&2/`
  - Exit code on failure: `/exit 1/`
- No bash execution in tests — the static approach is the established pattern here.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes; guard is self-contained in the script.
- **README.md**: No user-facing change needed.

## Dependencies
- `git` must be available in the shell environment where `verify.sh` runs (it always is in cycle workflows).
- `CYCLE_BASE` env var is injected by the cycle engine before calling verify; the fallback handles the standalone/manual invocation case.
