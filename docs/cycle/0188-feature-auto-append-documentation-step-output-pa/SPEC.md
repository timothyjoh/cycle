# SPEC — Cycle 0188: Auto-append Documentation-Step Output Paths to BUILD.md Touched Files

## Objective
After the documentation step executes, `run-cycle.ts` reads the working-tree diff and appends any paths the step modified (that are not already listed) into the `## Touched Files` section of `BUILD.md`. This eliminates the recurring `scopeGuard` commit failures caused by `README.md` and `docs/ARCHITECTURE.md` being modified by the documentation step but absent from the scope declaration authored during the build step.

## Source Issue
`refl-0187-scopeguard-blocks-documentation-step-fil` — "Auto-append documentation-step output paths to BUILD.md Touched Files so scopeGuard passes"

## Scope

### In Scope
- Post-documentation-step BUILD.md append logic in `run-cycle.ts`
- Unit tests covering the four cases specified in the issue acceptance criteria

### Out of Scope
- Reordering the documentation step before commit (tracked separately as `refl-0055`)
- Auto-populating BUILD.md Touched Files from the full git diff at build time
- Changes to `scopeGuard` itself or `commit-cycle.ts`

## Requirements
- After the documentation step completes with `status: "ok"`, `run-cycle.ts` must read `git status --porcelain` to identify working-tree-modified paths, then append any path not already in `## Touched Files` to that section of BUILD.md.
- The append must be idempotent: if a path is already listed, it must not be duplicated.
- If the documentation step is absent from the workflow, BUILD.md must remain unmodified.
- If BUILD.md does not exist or has no `## Touched Files` section, the append must be skipped silently (no error).
- The appended entries must follow the same bullet format used by `parseTouchedFiles`: `- <path>` with a trailing newline.

## Acceptance Criteria
- [ ] After documentation step succeeds and modifies files absent from Touched Files, those paths appear in BUILD.md `## Touched Files`
- [ ] A path already listed in Touched Files is not duplicated after the append
- [ ] A workflow with no documentation step leaves BUILD.md unchanged
- [ ] If BUILD.md is missing or has no `## Touched Files` section, no error is thrown
- [ ] `scopeGuard` passes on a subsequent commit when documentation-step paths have been auto-appended
- [ ] All existing tests continue to pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Test framework: Vitest (existing suite in `tests/engine/`)
- Unit tests in `tests/engine/run-cycle.test.ts`:
  - documentation step succeeds, one new file → appended to Touched Files
  - documentation step succeeds, file already listed → no duplicate
  - workflow has no documentation step → BUILD.md unchanged
  - BUILD.md missing → no error thrown, cycle continues
- No E2E tests required; the unit test directly exercises the append path

## Documentation Updates
- **docs/ENGINE.md**: Add a sentence under the documentation step section noting that `run-cycle.ts` auto-appends documentation-step output paths to BUILD.md Touched Files after a successful run.
- **README.md**: No change required — this is internal engine behavior.
- **CLAUDE.md / AGENTS.md**: No convention change.

## Dependencies
- `parseTouchedFiles` exported from `src/engine/commit-cycle.ts` (already exists at line 27) — available for reuse in the append helper
- `git status --porcelain` subprocess via `spawnSync` from `node:child_process` — already used in `commit-cycle.ts`
- BUILD.md present in `docs/cycle/<cycleId>-*/BUILD.md` — created by the build step, which precedes documentation in the feature workflow
