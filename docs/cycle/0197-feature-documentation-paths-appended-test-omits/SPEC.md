Good — fixture uses `"PATHS-APPENDED-1"`. Now I have everything needed to write the spec.

# SPEC — Cycle 0197: documentation.paths_appended test omits cycle_id payload assertion

## Objective
Add a missing `ev.cycle_id` assertion to Test A in the `documentation.paths_appended` test suite. The SPEC for cycle 0196 defines the event payload as `{ cycle_id: string, appended: string[] }`, but the existing test only validates `ev.appended`, leaving a gap where a key-name regression (e.g. `cycleId` vs `cycle_id`) would pass undetected.

## Source Issue
`refl-0196-documentation-paths-appended-test-omits` — "documentation.paths_appended test omits cycle_id payload assertion"

## Scope

### In Scope
- Add one assertion: `assert.equal(ev.cycle_id, "PATHS-APPENDED-1")` to Test A in `tests/engine/run-cycle.documentation.test.ts`

### Out of Scope
- Changes to production code (`src/`)
- Adding assertions to Test B (the no-emit case)
- Any other test gaps in unrelated tests

## Requirements
- `ev.cycle_id` must be asserted immediately after the `expectExactlyOne` call in Test A
- The asserted value must match the fixture's `issueId` (`"PATHS-APPENDED-1"`)
- No changes to any file except the one test file

## Acceptance Criteria
- [ ] `assert.equal(ev.cycle_id, "PATHS-APPENDED-1")` added in Test A immediately after the `expectExactlyOne` call
- [ ] The assertion value matches the `issueId` used in the test fixture (`"PATHS-APPENDED-1"`)
- [ ] `npm test` passes with the new assertion in place
- [ ] `npm run test:coverage` passes; coverage gates still met
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Single-file change to an existing test; no new test infrastructure needed
- After the change, manually verify that mutating `cycle_id` to a wrong key in `run-cycle.ts` causes the test to fail (sanity-check)
- Run `npm test` to confirm all 558+ tests still pass

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — this is a test-only fix
- **README.md**: No changes — internal test quality improvement, not user-facing

## Dependencies
- Cycle 0196 must be merged (it introduced `documentation.paths_appended`); it is already on `master` per git log
