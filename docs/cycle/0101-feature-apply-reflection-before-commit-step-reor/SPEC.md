# SPEC — Cycle 0101: Apply Reflection-Before-Commit Step Reorder

## Objective
Insert the `reflection` workflow step before `commit` in both `src/defaults/workflows.yml` and `.cycle/workflows.yml`. Three prior cycles (0078, 0081, 0082) each produced a commit titled as if this shipped, but the reflection step was never actually added to either file. This cycle delivers the four surgical edits — two YAML inserts, one test update, one CLAUDE.md doc addition — and exits with a green test suite.

## Source Issue
`refl-0081-reflection-before-commit-reorder-still-u` — "Apply reflection-before-commit step reorder in workflows.yml, test, and CLAUDE.md (cycle 0082 target)"

## Scope

### In Scope
- Add `reflection` step (before `commit`) to `src/defaults/workflows.yml` feature workflow
- Add `reflection` step (before `commit`) to `.cycle/workflows.yml` feature workflow
- Update `tests/defaults/feature-yaml.test.ts` step-order assertion to match
- Add ordering invariant documentation to `CLAUDE.md` Architecture section

### Out of Scope
- Changes to `src/engine/reflection.ts` (logic unchanged)
- Changes to any other workflow (quickfix, document, e2e-tests)
- Changes to reflection artifact naming, storage, or ingestion
- New test files (one existing assertion covers the invariant once updated)

## Requirements
- `src/defaults/workflows.yml` feature step sequence: `[spec, research, plan, build, review, fix, verify, reflection, commit, pr, documentation]` (11 steps)
- `.cycle/workflows.yml` feature step sequence: `[spec, research, plan, build, review, fix, verify, reflection, commit]` (9 steps, no `pr` — trunk-based)
- `.cycle/workflows.yml` LOCAL DIVERGENCE comment block (lines 11–16) must be preserved byte-identical
- `tests/defaults/feature-yaml.test.ts` step-order assertion and step-count assertion updated to reflect 11 steps with `reflection` at index 7
- `CLAUDE.md` documents the ordering invariant: `reflection` must precede `commit`/`pr` so reflection artifacts ride the same commit as the feature change
- `npm test` passes with no regressions, no new compiler warnings

## Acceptance Criteria
- [ ] `src/defaults/workflows.yml` feature steps contain `[..., "verify", "reflection", "commit", "pr", "documentation"]`
- [ ] `.cycle/workflows.yml` feature steps contain `[..., "verify", "reflection", "commit"]` (no `pr`)
- [ ] `.cycle/workflows.yml` LOCAL DIVERGENCE block (lines 11–16) byte-identical to pre-edit
- [ ] `tests/defaults/feature-yaml.test.ts` `deepEqual` assertion lists `"reflection"` at index 7 and step-count assertion is 11
- [ ] `CLAUDE.md` Architecture section contains an ordering invariant sentence documenting that `reflection` must precede `commit`
- [ ] `npm test` exits 0 with no regressions
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- `tests/defaults/feature-yaml.test.ts`: primary regression guard — reads `src/defaults/workflows.yml` and asserts exact step names and count; must pass after YAML and test edits
- Full `npm test` suite run after all four edits to catch regressions
- No new test files needed; no engine behavior changes, so no integration test additions

## Documentation Updates
- **CLAUDE.md**: Add ordering invariant sentence to the Architecture section explaining that `reflection` must precede `commit`/`pr` so reflection artifacts are committed under the cycle that produced them
- **README.md**: No change required

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `refl-0080-cycle-0080-empty-diff-guard-never-implem-apply-fix-md-tasks` (empty-diff post-condition guard) must already be in `master` — without it, a permission-blocked BUILD.md will once again let this cycle drain to `done/` with zero code changes, repeating the 0078/0081/0082 failure pattern
- `prompts/reflection.md` exists in `src/defaults/prompts/` (confirmed)
