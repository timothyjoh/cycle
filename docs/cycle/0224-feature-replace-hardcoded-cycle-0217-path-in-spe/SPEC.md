# SPEC — Cycle 0224: Replace Hardcoded Cycle-0217 Path in spec.md Negative Example

## Objective
The negative example in `src/defaults/prompts/spec.md` embeds a literal path referencing cycle 0217's artifact directory. As cycles accumulate, this path grows stale and loses pedagogical force — the model may treat it as a historical artifact rather than a live guardrail. This cycle replaces the hardcoded path with a generic placeholder so the example remains contextually meaningful across all future cycles.

## Source Issue
`refl-0217-spec-md-negative-example-hardcodes-cycle` — "Replace hardcoded cycle-0217 path in spec.md negative example with generic placeholder"

## Scope

### In Scope
- Replace the hardcoded path `docs/cycle/0217-feature-fix-spec-step-learning-mode-conflict-cau/SPEC.md` with `docs/cycle/NNNN-feature-<title>/SPEC.md` in `src/defaults/prompts/spec.md`
- Run `npm run sync-defaults` to propagate the change to `.cycle/prompts/spec.md`

### Out of Scope
- Changes to any other prompt template files
- Changes to the sanitizer or test infrastructure
- Updating any other hardcoded cycle references elsewhere in the codebase

## Requirements
- The negative example in `src/defaults/prompts/spec.md` must use a generic placeholder path, not a cycle-specific one
- The `.cycle/prompts/spec.md` file must be in sync with the source after `npm run sync-defaults`
- No test regressions

## Acceptance Criteria
- [ ] `src/defaults/prompts/spec.md` contains `docs/cycle/NNNN-feature-<title>/SPEC.md` and does not contain `0217-feature-fix-spec-step-learning-mode-conflict-cau`
- [ ] `.cycle/prompts/spec.md` contains the same generic placeholder (sync confirmed)
- [ ] `npm test` passes with no failures
- [ ] `npm run typecheck` passes with no warnings
- [ ] Coverage does not decrease vs baseline

## Testing Strategy
- Run `npm test` to confirm no regressions
- Run `npm run typecheck` to confirm no type errors
- Run `npm run test:coverage` and `npm run check:coverage` to confirm coverage floors still pass
- Grep both `src/defaults/prompts/spec.md` and `.cycle/prompts/spec.md` to verify the hardcoded path is gone and the placeholder is present

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes required
- **README.md**: No user-facing changes

## Dependencies
- `npm run sync-defaults` script must be functional (established)
- No external services or env vars required
