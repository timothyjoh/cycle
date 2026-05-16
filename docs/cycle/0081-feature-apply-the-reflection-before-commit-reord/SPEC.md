# SPEC — Cycle 0081: Apply Reflection-Before-Commit Step Reorder

## Objective
Cycle 0078 was supposed to reorder the `reflection` step before `commit` in both workflow files, but permission blocks caused build and fix steps to silently succeed without making any code changes. This cycle applies those four concrete edits verbatim: swap step order in two workflow YAML files, update the test assertion, and add an invariant documentation bullet to CLAUDE.md. The goal is to ensure reflection artifacts are committed under the cycle that produces them rather than being scooped by the next cycle's commit step.

## Source Issue
`refl-0078-cycle-0078-fix-never-applied-reflection` — "Apply the reflection-before-commit reorder that cycle 0078 failed to execute"

## Scope

### In Scope
- Swap `reflection` before `commit` in `src/defaults/workflows.yml`
- Swap `reflection` before `commit` in `.cycle/workflows.yml` (preserving the LOCAL DIVERGENCE block)
- Update step-order assertion in `tests/defaults/feature-yaml.test.ts`
- Add invariant bullet to CLAUDE.md reflection-step architecture note

### Out of Scope
- Any changes to the reflection step implementation logic
- Any changes to how reflection artifacts are named or stored
- Any other workflow step reorderings

## Requirements
- `reflection` must appear before `commit` in both workflow files
- `.cycle/workflows.yml` LOCAL DIVERGENCE block (`no_branch: true`, `commit-trunk.sh`, no `pr` step) must be preserved exactly
- The test assertion must match the new step order
- The CLAUDE.md invariant bullet must explain why the ordering matters (artifacts committed under producing cycle, not scooped by next cycle)

## Acceptance Criteria
- [ ] `src/defaults/workflows.yml`: `reflection` step appears before `commit` step
- [ ] `.cycle/workflows.yml`: `reflection` appears before `commit`, LOCAL DIVERGENCE block intact and unchanged
- [ ] `tests/defaults/feature-yaml.test.ts`: step-order assertion updated to `[..."reflection","commit","pr"...]`
- [ ] `CLAUDE.md`: invariant bullet present under reflection-step architecture note
- [ ] `npm test` exits 0 with no regressions
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Node native test runner via `npm test`
- `tests/defaults/feature-yaml.test.ts` already asserts step order — updating the assertion is the primary test change
- After edits, run `npm test` to confirm no regressions
- No new test files needed; the existing assertion covers the behavioral invariant once updated

## Documentation Updates
- **CLAUDE.md**: Add invariant bullet to the reflection-step architecture note: `reflection` must precede `commit` in the workflow so reflection artifacts are committed under the cycle that produces them and not scooped by the next cycle's commit step.
- **README.md**: No user-facing change required.

## Dependencies
- No external dependencies
- `docs/cycle/0078-*/PLAN.md` exists as the authoritative prior plan (no new research needed)
