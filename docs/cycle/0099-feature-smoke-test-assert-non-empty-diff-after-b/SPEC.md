Write permission needed for the SPEC.md artifact. The spec content is ready — outputting to stdout per the engine's capture convention:

---

# SPEC — Cycle 0099: Empty-Diff Guard Implementation + Regression Tests

## Objective

Cycle 0098 was supposed to implement an empty-diff post-condition guard for `build` and `fix` steps in `run-cycle.ts`, but the implementation was blocked by permissions and never written — despite the commit claiming otherwise. This cycle completes both missing pieces: (1) implements the three-change guard in `src/engine/run-cycle.ts`, and (2) adds a regression test suite that pins the behavior so this class of false-positive-success cannot silently recur.

## Source Issue

`refl-0081-cycle-0081-drained-done-with-placeholder-empty-diff-smoke-test` — "Smoke test: assert non-empty diff after build/fix steps that report status:ok"

## Scope

### In Scope

- Implement the empty-diff post-condition guard in `src/engine/run-cycle.ts` (the three changes documented in `docs/cycle/0098-quickfix-implement-empty-diff-post-condition-guar/QUICK_FIX.md`):
  1. Add `spawnSync` import from `node:child_process`
  2. Export `EMPTY_DIFF_GUARD_STEPS` set and `formatBuildGuardError` function
  3. Add `else if` guard after the spec-guard block that runs `git diff HEAD` and fails the step when stdout is empty
- Add `tests/engine/run-cycle.empty-diff-guard.test.ts` with regression tests covering the guard behavior

### Out of Scope

- Guards for steps other than `build` and `fix`
- Placeholder-sentinel detection ("Waiting for permission grants") mentioned in the issue Notes — deferred
- `no_branch: true` workflows (guard must be skipped for trunk workflows; test verifies the skip)

## Requirements

- `EMPTY_DIFF_GUARD_STEPS` is a `ReadonlySet<string>` containing `"build"` and `"fix"`, exported from `run-cycle.ts`
- `formatBuildGuardError(stepName)` returns `"${stepName} post-condition failed: no code changes detected"`, exported from `run-cycle.ts`
- When a `build` or `fix` step agent exits 0 on a branch-based workflow, the engine runs `git diff HEAD` synchronously in `repoRoot`; if stdout is empty, the step is mutated to `status: "failed"` with the formatted error as `stderr`
- The guard does NOT fire for `no_branch: true` workflows (conditioned on `!wf.no_branch`)
- `git diff HEAD` check uses `spawnSync` with array args (no shell), respects subprocess discipline
- Guard fires only when `diff.status === 0 && !diff.stdout` — a non-zero `git` exit does not flip the step

## Acceptance Criteria

- [ ] `src/engine/run-cycle.ts` exports `EMPTY_DIFF_GUARD_STEPS` (set containing `"build"` and `"fix"`) and `formatBuildGuardError`
- [ ] A `build` step that exits 0 but makes no file changes emits `cycle.end status:failed failing_step:build`
- [ ] A `fix` step that exits 0 but makes no file changes emits `cycle.end status:failed failing_step:fix`
- [ ] A `build` step on a `no_branch: true` workflow that exits 0 with no changes emits `cycle.end status:ok` (guard skipped)
- [ ] Tests use the fake-claude stub pattern from `tests/engine/run-cycle.spec-guard.test.ts` (real git repo, real `spawnSync`, fake binary in tmpdir)
- [ ] `npm test` passes with no regression against coverage baselines (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- [ ] `npm run typecheck` exits 0

## Testing Strategy

- Framework: Node native test runner (`node:test`), matching all existing engine test files
- New file: `tests/engine/run-cycle.empty-diff-guard.test.ts`
- Test setup: `mkdtemp` repo + fake `claude` binary in separate tmpdir, injected via `PATH` in `env` option — identical pattern to `run-cycle.spec-guard.test.ts`
- Key scenarios:
  1. `build` step, branch workflow, agent exits 0, no file touched → `cycle.end status:failed`
  2. `fix` step, branch workflow, agent exits 0, no file touched → `cycle.end status:failed`
  3. `build` step, branch workflow, agent exits 0 AND creates/modifies a tracked file → `cycle.end status:ok`
  4. `build` step, `no_branch: true` workflow, agent exits 0, no file touched → `cycle.end status:ok`
- Fake agent that produces a real file change: write a file in `repoRoot` from inside the fake shell script before exiting
- Parameterize `[false, true]` over `noBranch` where relevant (same pattern as spec-guard test)

## Documentation Updates

- **CLAUDE.md**: Extend the "Spec post-condition" bullet in the Architecture quick reference to describe the analogous empty-diff guard for `build`/`fix` steps — reference `EMPTY_DIFF_GUARD_STEPS` and `formatBuildGuardError`
- **README.md**: No user-facing change required

## Dependencies

- `src/engine/run-cycle.ts` spec-guard block at lines ~194–205 already present — new guard is an `else if` appended to that block
- `tests/engine/run-cycle.spec-guard.test.ts` exists as the pattern reference
- Node ≥ 22.6 with `--experimental-strip-types` (already the project runtime)
