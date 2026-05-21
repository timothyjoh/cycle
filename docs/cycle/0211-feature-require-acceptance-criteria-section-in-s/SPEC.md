# SPEC — Cycle 0211: Require ## Acceptance Criteria Section in spec.md Prompt Output

## Objective
Add a mandatory `## Acceptance Criteria` section to the spec-writer prompt so that every generated SPEC.md contains at least one testable, verifiable bullet. This eliminates the failure mode where SPEC artifacts are thin narration and downstream steps (PLAN, REVIEW) must independently invent acceptance criteria rather than trace against SPEC-stated ones. The review prompt is updated in parallel to verify SPEC AC bullets directly, not PLAN inferences.

## Source Issue
`refl-0205-spec-md-prompt-does-not-require-a-struct` — "Require ## Acceptance Criteria section in spec.md prompt output"

## Scope

### In Scope
- Add required `## Acceptance Criteria` section with explicit bullet format requirements to `src/defaults/prompts/spec.md`
- Update `src/defaults/prompts/review.md` to reference SPEC AC bullets directly in Pass 1 spec-compliance check
- Run `npm run sync-defaults` to propagate both changes to `.cycle/prompts/`

### Out of Scope
- Validating existing SPEC artifacts retroactively
- Adding runtime enforcement (e.g., engine-level AC presence check) — that is a follow-on cycle
- Changes to PLAN.md prompt format

## Requirements
- `src/defaults/prompts/spec.md` must require a `## Acceptance Criteria` section in its output template
- The section must mandate at least one testable, bulleted condition
- Bullet format must be prescriptive: observable outcomes, not vague narration
- `src/defaults/prompts/review.md` Pass 1 spec-compliance check must instruct the reviewer to verify each SPEC `## Acceptance Criteria` bullet one-for-one against the implementation
- Review instructions must flag a missing or empty `## Acceptance Criteria` section as a SPEC defect, not a PLAN gap
- Review instructions must not accept PLAN-inferred criteria as substitute for SPEC-stated criteria
- `.cycle/prompts/spec.md` and `.cycle/prompts/review.md` must match `src/defaults/prompts/` after sync

## Acceptance Criteria
- [ ] `src/defaults/prompts/spec.md` output template contains a `## Acceptance Criteria` section with at least one example testable bullet and instruction that the section is required
- [ ] `.cycle/prompts/spec.md` matches `src/defaults/prompts/spec.md` after `npm run sync-defaults`
- [ ] `src/defaults/prompts/review.md` Pass 1 instructs reviewer to check each SPEC AC bullet one-for-one and flag missing AC section as SPEC defect
- [ ] `.cycle/prompts/review.md` matches `src/defaults/prompts/review.md` after `npm run sync-defaults`
- [ ] Full test suite passes (`npm test`) with no new failures

## Testing Strategy
- No new unit tests required — this change is prompt text only; correctness is verified by reading the updated files and confirming the required sections are present
- Confirm `npm run sync-defaults` produces identical content in `.cycle/prompts/spec.md` vs `src/defaults/prompts/spec.md` (diff should be empty)
- Same diff check for `review.md`
- Run `npm test` to confirm no regressions

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes needed — prompt behavior is internal to the engine
- **README.md**: No user-facing change to surface

## Dependencies
- `src/defaults/prompts/spec.md` exists (confirmed in codebase)
- `src/defaults/prompts/review.md` exists (confirmed in codebase)
- `npm run sync-defaults` script is functional
