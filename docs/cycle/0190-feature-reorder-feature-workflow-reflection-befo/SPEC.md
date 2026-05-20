# SPEC — Cycle 0190: Reorder feature workflow: reflection before documentation

## Objective
Move the `reflection` step before the `documentation` step in the feature workflow so that reflection insights (sharp edges, known limitations, deferred items) are available to the documentation agent when it writes release notes and doc updates. Currently reflection runs last and its output cannot influence the same cycle's documentation.

## Source Issue
`refl-0187-reflection-runs-after-documentation-prev-reorder-reflection-before-docs` — "Reorder feature workflow: reflection before documentation"

## Scope

### In Scope
- Swap `reflection` and `documentation` in `src/defaults/workflows.yml` feature workflow
- Run `npm run sync-defaults` to propagate the change to `.cycle/workflows.yml`
- Update step-order assertions in `tests/defaults/feature-yaml.test.ts` and `tests/dogfood/feature-yaml.test.ts`
- Update `docs/ARCHITECTURE.md` wherever it enumerates the feature step sequence by name/position

### Out of Scope
- Changes to `reflection` or `documentation` prompt content
- Any other workflow (`bug`, `research`, `document`, `quickfix`, `e2e-tests`)
- The complementary reorder-documentation-before-commit issue (`refl-0055-*`)

## Requirements
- `reflection` must appear immediately before `documentation` in the feature step list
- The step count (9) must remain unchanged
- `npm run sync-defaults` must produce a `.cycle/workflows.yml` byte-identical to `src/defaults/workflows.yml` (modulo the comment header)
- All existing tests must pass with no regressions

## Acceptance Criteria
- [ ] `reflection` step appears before `documentation` in `src/defaults/workflows.yml` feature workflow
- [ ] `npm run sync-defaults` run; `.cycle/workflows.yml` reflects the new order
- [ ] `tests/defaults/feature-yaml.test.ts` step-order array updated to `[..., "verify", "reflection", "documentation"]`
- [ ] `tests/dogfood/feature-yaml.test.ts` step-order array updated to match
- [ ] `docs/ARCHITECTURE.md` updated wherever it lists `verify → documentation → reflection` or `documentation → reflection` in prose or YAML examples
- [ ] `npm test` passes with no regressions

## Testing Strategy
- Existing `tests/defaults/feature-yaml.test.ts` and `tests/dogfood/feature-yaml.test.ts` assert the exact step order array — update the expected arrays; they serve as the primary regression guard
- No new test files needed; the pinning tests are sufficient
- Run `npm test` (which auto-builds) to confirm all 530+ tests pass

## Documentation Updates
- **docs/ARCHITECTURE.md**: Update every occurrence of the step sequence string `verify → documentation → reflection` to `verify → reflection → documentation` (found at lines ~496, ~663)
- **BRIEF.md**: Not enumerated by position; no change needed
- **README.md**: Not enumerated by position; no change needed
- **docs/ENGINE.md**: Does not enumerate step order; no change needed

## Dependencies
- `npm run sync-defaults` script must exist (it does — confirmed in `package.json` via CLAUDE.md)
- Node ≥ 22.6 for test runner (`--experimental-strip-types`)
