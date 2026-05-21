# SPEC — Cycle 0204: Add engine-lock.ts to CLAUDE.md Per-File Coverage Floors

## Objective
Add the missing `src/engine/engine-lock.ts (100%)` entry to the Coverage policy section of `CLAUDE.md`. The entry was added to `scripts/coverage-gate.mjs` during cycle 0202 but the corresponding prose in `CLAUDE.md` was not updated. Without it, contributors consulting `CLAUDE.md` for coverage requirements will be unaware of the floor and may inadvertently reduce it.

## Source Issue
`refl-0202-claude-md-per-file-floors-list-missing-e` — "CLAUDE.md per-file floors list missing engine-lock.ts 100% floor"

## Scope

### In Scope
- Add `src/engine/engine-lock.ts` (100%) to the per-file floors list in the Coverage policy section of `CLAUDE.md`, using the same format as adjacent entries.

### Out of Scope
- Any changes to `scripts/coverage-gate.mjs` or actual coverage thresholds.
- Adding a process to keep `CLAUDE.md` floors in sync automatically (deferred).
- Updating any other file beyond `CLAUDE.md`.

## Requirements
- The entry must appear in the Coverage policy section alongside existing per-file floor entries.
- The entry format must match adjacent entries: `src/engine/<file>.ts` (N%).
- No other content in `CLAUDE.md` may change.

## Acceptance Criteria
- [ ] `CLAUDE.md` Coverage policy section lists `src/engine/engine-lock.ts` (100%) alongside the other per-file floors.
- [ ] Entry format matches the adjacent `src/engine/path-utils.ts` (100%) entry.
- [ ] No other content in `CLAUDE.md` is changed.
- [ ] `npm test` passes.

## Testing Strategy
- This change is documentation-only; no code logic is affected.
- `npm test` (full suite) must pass to confirm no regressions.
- Manual inspection of the Coverage policy section confirms correct placement and format.

## Documentation Updates
- **CLAUDE.md**: Add `src/engine/engine-lock.ts` (100%) to the per-file floors list. This is the only file changed.
- **README.md**: No change required.

## Dependencies
- `scripts/coverage-gate.mjs` already enforces the 100% floor for `engine-lock.ts`; this cycle only documents it in `CLAUDE.md`.
