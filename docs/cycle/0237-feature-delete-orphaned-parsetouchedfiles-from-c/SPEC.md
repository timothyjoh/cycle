# SPEC — Cycle 0237: Delete Orphaned parseTouchedFiles from commit-cycle.ts

## Objective

This cycle removes a dead-code export from `src/engine/commit-cycle.ts`. The function `parseTouchedFiles` previously parsed the `## Touched Files` YAML block from agent-authored BUILD.md artifacts. Cycle 0227 replaced that mechanism with engine-owned `touched.json`, leaving `parseTouchedFiles` with no production caller. The function and its three dedicated tests must be deleted to eliminate a maintenance trap: an exported async function with a test suite signals "load-bearing" to future maintainers even when it does nothing production uses.

## Source Issue

`refl-0227-parsetouchedfiles-is-orphaned-in-commit` — "Delete orphaned parseTouchedFiles from commit-cycle.ts"

## Scope

### In Scope

- Delete `parseTouchedFiles` from `src/engine/commit-cycle.ts` (lines 15–33).
- Delete the three unit tests in `tests/engine/commit-cycle.test.ts` (lines 424–463) that exercise `parseTouchedFiles` directly.
- Confirm the test suite passes with coverage floors intact after the deletion.

### Out of Scope

- Adding any replacement utility for BUILD.md parsing.
- Modifying the `touched.json` mechanism or any other part of commit-cycle logic.
- Removing any other dead code discovered incidentally.

## Requirements

- `parseTouchedFiles` must be absent from `src/engine/commit-cycle.ts` after this change — no stub, no comment remnant.
- No test file may reference `parseTouchedFiles` after deletion.
- Coverage floors for `src/engine/commit-cycle.ts` (95% line) must continue to pass; deleting both the function and its tests leaves the ratio intact.
- No new imports or exports are introduced; only deletions occur.

## Acceptance Criteria

- [ ] `grep -r "parseTouchedFiles" src/` returns no matches.
- [ ] `grep -r "parseTouchedFiles" tests/` returns no matches.
- [ ] `npm test` exits 0 with all tests passing.
- [ ] `npm run test:coverage && npm run check:coverage` exits 0 with per-file floor for `src/engine/commit-cycle.ts` still met (≥ 95% line coverage).
- [ ] `npm run check:invariants` exits 0.
- [ ] `npm run typecheck` exits 0 with no warnings.

## Testing Strategy

- No new tests are written; this cycle is deletion-only.
- After removing the function and its three test cases, run the full suite (`npm test`) to confirm no other test imported or called `parseTouchedFiles`.
- Run `npm run test:coverage` to verify that removing dead code and its paired tests does not depress coverage below the 95% floor for `src/engine/commit-cycle.ts`.

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No change — `parseTouchedFiles` was never documented as a public API or a convention.
- **README.md**: No user-facing change.
- **docs/ENGINE.md**: No change — the touched.json mechanism was documented in cycle 0227; this cycle only removes the superseded parser.

## Dependencies

- Cycle 0236 (artifactDir threading into `CommitCycleOpts`) must already be merged; `src/engine/commit-cycle.ts` must be in its post-0236 state before this deletion lands.
- No external services or env vars required.
