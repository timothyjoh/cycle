# SPEC — Cycle 0191: Add REFLECTION.md to Documentation Prompt Inputs

## Objective
The documentation prompt (`src/defaults/prompts/documentation.md`) currently reads only SPEC.md, BUILD.md, REVIEW.md, and FIX.md as inputs. Cycle 0190 reordered the feature workflow so reflection runs before documentation, creating the structural precondition for reflection outputs to inform docs — but the documentation agent has no awareness of REFLECTION.md. This cycle closes that gap: adding REFLECTION.md to the prompt's input list with extraction guidance so the reorder delivers its intended benefit.

## Source Issue
`refl-0190-documentation-prompt-does-not-read-refle` — "Add REFLECTION.md to documentation prompt inputs so cycle 0190 reorder delivers its intended benefit"

## Scope

### In Scope
- Add `REFLECTION.md` to the `## Inputs to read` section of `src/defaults/prompts/documentation.md`
- Add guidance on what to extract from REFLECTION.md (deferred items, known limitations, sharp edges)
- Run `npm run sync-defaults` to propagate the change to `.cycle/prompts/documentation.md`

### Out of Scope
- Changes to the reflection prompt itself or its output format
- Changing the workflow step ordering (already done in cycle 0190)
- Any changes to how REFLECTION.md is generated
- Structural changes to the documentation prompt beyond adding the new input

## Requirements
- `REFLECTION.md` appears in the `## Inputs to read` section alongside the existing artifact inputs
- Extraction guidance specifies three categories: deferred items, known limitations, sharp edges
- The prompt body instructs the agent on how to surface these in documentation output
- The sync-defaults propagation keeps source and deployed prompt in sync
- No test regressions introduced

## Acceptance Criteria
- [ ] `REFLECTION.md` appears in the `## Inputs to read` section of `src/defaults/prompts/documentation.md`
- [ ] Guidance on what to extract from `REFLECTION.md` is included in the prompt body (deferred items, known limitations, sharp edges)
- [ ] `npm run sync-defaults` run after editing the source; `.cycle/prompts/documentation.md` matches `src/defaults/prompts/documentation.md`
- [ ] `npm test` passes with no regressions
- [ ] No coverage regression vs master baseline

## Testing Strategy
- Run `npm test` to confirm no existing tests break (this is a prompt-file edit; no TypeScript logic changes)
- Run `npm run test:coverage` and `npm run check:coverage` to verify coverage floors hold
- Manually diff `src/defaults/prompts/documentation.md` and `.cycle/prompts/documentation.md` to confirm sync-defaults propagated correctly

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes required
- **README.md**: No user-facing change to surface; this is an internal prompt template edit

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/defaults/prompts/documentation.md` must exist (it does)
- `npm run sync-defaults` script must be functional (it is, per CLAUDE.md)
- Cycle 0190 must be merged so REFLECTION.md is generated before documentation runs in the workflow (it is, per git log)
