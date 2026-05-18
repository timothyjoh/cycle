Now I have full context. Writing the spec.

```markdown
# SPEC — Cycle 0138: Drop `scripts/**` Coverage Exclusion and Cover sync-defaults Guard Branches

## Objective
Remove the `--test-coverage-exclude='scripts/**'` flag from `package.json`'s `test:coverage` script so that `scripts/sync-defaults.mjs` is included in coverage instrumentation, then add targeted tests for the four named untested branches in its divergence guard. The guard is data-loss-prevention code; excluding it from coverage hides regression surface for exactly the class of incident (silent clobber of local divergence) that cycle 0046 produced.

## Source Issue
`refl-0048-sync-defaults-guard-logic-sits-in-covera` — "Drop `scripts/**` coverage exclusion so sync-defaults guard logic is instrumented"

## Scope

### In Scope
- Drop `--test-coverage-exclude='scripts/**'` from `package.json` `test:coverage` command.
- Add a test file `tests/scripts/sync-defaults.test.ts` covering the four named branches.
- Add `scripts/sync-defaults.mjs` to the `FLOORS` table in `scripts/coverage-gate.mjs` with an appropriate floor.

### Out of Scope
- Changes to `scripts/sync-defaults.mjs` logic itself.
- Adding floors for `scripts/coverage-gate.mjs` or `scripts/build.mjs`.
- Covering branches in other scripts beyond `sync-defaults.mjs`.

## Requirements
- `npm run test:coverage` must include `scripts/sync-defaults.mjs` in the LCOV report.
- All four named branches must be exercised by at least one test case.
- Aggregate thresholds (line ≥ 95%, branch ≥ 75%, function ≥ 90%) must hold after the exclusion is dropped.
- Coverage gate must not exit 2 due to a missing LCOV block for the new floor entry.
- Tests must spawn `scripts/sync-defaults.mjs` via `spawnSync` in a temp directory (matching the pattern already used in `tests/scripts/coverage-gate.test.ts`).

## Acceptance Criteria
- [ ] `package.json` `test:coverage` no longer contains `--test-coverage-exclude='scripts/**'`.
- [ ] `npm run test:coverage` produces an LCOV block for `scripts/sync-defaults.mjs`.
- [ ] Test: malformed `.cycle/.sync-state.json` → `loadState` returns `{}`, run proceeds without error, exit 0.
- [ ] Test: `src/defaults/` directory missing → `discoverPairs` returns empty list, exit 0, no files written.
- [ ] Test: `--force` with no divergent destinations → no forced-overwrite stderr line, exit 0.
- [ ] Test: skipped (divergent) destination's prior `.sync-state.json` entry is unchanged after the run.
- [ ] `scripts/sync-defaults.mjs` added to `FLOORS` in `scripts/coverage-gate.mjs`; gate passes.
- [ ] All existing tests still pass (`npm test`).
- [ ] `npm run typecheck` passes with no new warnings.

## Testing Strategy
- Framework: Node built-in test runner (`node:test`), matching project convention.
- Test file: `tests/scripts/sync-defaults.test.ts` — spawns `node scripts/sync-defaults.mjs` via `spawnSync` with curated temp directories as cwd per test.
- Each test creates an isolated temp dir with a minimal fixture (src/defaults/, .cycle/, .sync-state.json as needed), runs the script, asserts exit code and state file contents.
- Four tests map 1:1 to the four named branches from the issue.
- No mocking — spawn-based tests exercise real file I/O, matching the E2E pattern used for `coverage-gate.test.ts`.

## Documentation Updates
- **CLAUDE.md**: Update "Coverage policy" section — note that `scripts/sync-defaults.mjs` is now instrumented and gated.
- **README.md**: No user-facing change required.

## Dependencies
- `refl-0048-plan-vs-impl-drift-on-conditional-state` resolved (it is — cycle 0136 addressed the unconditional write behavior). The test for branch #4 (skipped-path entry preservation) pins the post-0136 resolved behavior: `writeStateAtomic` is called unconditionally, so a skipped path's prior entry must survive because the loop `continue`s before `state[to] = …` is assigned.
- `scripts/sync-defaults.mjs` must be on disk at its current path (it is).
```
