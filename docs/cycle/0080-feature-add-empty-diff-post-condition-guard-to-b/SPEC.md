Artifact dir exists. Writing SPEC.md to stdout now.

# SPEC — Cycle 0080: Add Empty-Diff Post-Condition Guard to Build and Fix Steps

## Objective
Add a post-condition guard to the `build` and `fix` steps in `src/engine/run-cycle.ts` that detects when an agent exits 0 but produced no code changes (empty `git diff HEAD`). When the diff is empty, the step is flipped to `failed` with a descriptive error before `step.end` emits. This closes the silent-success gap demonstrated in cycle 0078, where a permission-blocked build agent wrote a placeholder artifact, exited 0, and the cycle closed as `ok` with zero implementation. The fix is directly analogous to the existing `SPEC_MIN_BYTES` guard for the `spec` step.

## Source Issue
`refl-0078-build-and-fix-steps-silently-succeed-whe` — "Add empty-diff post-condition guard to build and fix steps"

## Scope

### In Scope
- Export `EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string>` (containing `"build"` and `"fix"`) in `src/engine/run-cycle.ts`
- Export `formatBuildGuardError(stepName: string): string` helper in `src/engine/run-cycle.ts`
- Guard logic: after artifact write, for non-bash agents on branch-based workflows, run `git diff HEAD` via `spawnSync` and flip `r.status = "failed"` with guard error if diff is empty
- Unit tests covering all acceptance criteria cases

### Out of Scope
- Generalizing the guard to other steps (e.g., `verify`, `commit`)
- Applying the guard to `no_branch: true` workflows
- Touching any file other than `src/engine/run-cycle.ts` and the test file

## Requirements
- After the artifact write seam for `build` and `fix` steps, check `git diff HEAD` output
- Empty diff → `r.status = "failed"`, `r.stderr = formatBuildGuardError(stepName)`
- Non-empty diff → no change to `r.status`
- Guard bypassed when `workflow.no_branch === true`
- Guard bypassed when `step.agent === "bash"`
- Artifact (`BUILD.md` / `FIX.md`) is written before guard fires; placeholder text survives even when guard flips status
- `git diff HEAD` invoked via `spawnSync` with array args, no `shell: true`
- Exported constant and helper mirror the naming pattern of `SPEC_MIN_BYTES` / `formatSpecGuardError`

## Acceptance Criteria
- [ ] `build` step exits 0 with empty `git diff HEAD` → `step.end status:failed`, stderr contains `"build post-condition failed: no code changes detected"`
- [ ] `fix` step exits 0 with empty `git diff HEAD` → `step.end status:failed`, stderr contains `"fix post-condition failed: no code changes detected"`
- [ ] `build` or `fix` step that produces a non-empty diff is unaffected (`step.end status:ok`)
- [ ] `no_branch: true` workflow bypasses the guard entirely (no `git diff` invocation, no status flip)
- [ ] Bash agent `build`/`fix` steps bypass the guard
- [ ] `BUILD.md` / `FIX.md` artifact is written before the guard fires; placeholder text survives in the artifact even when the guard flips status to failed
- [ ] Tests cover: empty-diff → failed (build), empty-diff → failed (fix), non-empty-diff → ok, `no_branch:true` bypass, bash-agent bypass
- [ ] Coverage does not drop below master baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Node native test runner (`node:test`), consistent with the existing test suite
- Add a new test file `tests/engine/empty-diff-guard.test.ts` (or extend `tests/engine/run-cycle.test.ts` if the guard logic is small enough to co-locate)
- Mock `spawnSync` for the `git diff HEAD` call so tests are hermetic
- Key scenarios: empty stdout from `git diff HEAD` (guard fires), non-empty stdout (guard skips), `no_branch: true` flag (guard skips entirely), `step.agent === "bash"` (guard skips), guard fires on both `"build"` and `"fix"` step names
- Verify artifact write precedes guard check (artifact content intact when guard fails the step)

## Documentation Updates
- **CLAUDE.md**: Add a bullet under the architecture quick reference describing the empty-diff guard (mirrors the `Spec post-condition` bullet already present)
- **README.md**: No user-facing change required; guard is internal engine behavior

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `SPEC_MIN_BYTES` / `formatSpecGuardError` pattern already established in `src/engine/run-cycle.ts` — implementation follows the same shape
- Branch-based workflow (`no_branch` flag) already threaded through `runCycle` context — available at the guard call site
