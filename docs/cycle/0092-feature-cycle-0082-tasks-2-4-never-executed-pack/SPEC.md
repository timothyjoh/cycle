Prerequisite is done. Outputting SPEC:

```markdown
# SPEC — Cycle 0092: Wire tsconfig-floor guard into npm lifecycle, add tests, resolve RFC-002

## Objective
Cycle 0082 left Tasks 2–4 of its PLAN unexecuted. This cycle completes
them: wire the `check-tsconfig-floor.mjs` script into `package.json`
lifecycle hooks, add a four-case test suite, and annotate RFC-002 to
mark the deferrable-concern resolved. The prerequisite (Task 1 —
correct script content) landed in cycle 0091.

## Source Issue
`refl-0082-cycle-0082-tasks-2-4-never-executed-pack` — "cycle 0082 tasks 2-4 never executed — package.json, test suite, RFC-002 all missing"

## Scope

### In Scope
- Add `"check:tsconfig-floor"` npm script to `package.json`
- Prepend `npm run check:tsconfig-floor &&` to `pretest:coverage` in `package.json`
- Create `tests/scripts/check-tsconfig-floor.test.ts` with all four SPEC cases
- Annotate RFC-002 deferrable-concern sentence to reference `check:tsconfig-floor` and mark resolved

### Out of Scope
- Any changes to `scripts/check-tsconfig-floor.mjs` itself (done in cycle 0091)
- Expanding the per-file `FLOORS` table in `coverage-gate.mjs` beyond its current state
- CI/GitHub Actions integration of the floor check

## Requirements
- `package.json` `scripts.check:tsconfig-floor` must be `"node scripts/check-tsconfig-floor.mjs"`
- `package.json` `scripts.pretest:coverage` must invoke `check:tsconfig-floor` before the existing build step
- Test file must use Node's native test runner (`node:test` + `node:assert`) matching the project's existing test style
- Tests must invoke the script via `spawnSync` (subprocess, not import) to verify real exit codes and stdout/stderr output
- All four cases must be covered: valid config exits 0; wrong target exits 1 with diagnostic; sub-floor lib entry exits 1 with diagnostic; missing tsconfig exits 1 with not-found message
- RFC-002 line 19 deferrable-concern annotation must reference `npm run check:tsconfig-floor` by name and state the concern is resolved
- `npm run typecheck` must pass with no warnings
- Coverage must not regress (line ≥ 95%, branch ≥ 75%, function ≥ 90%)

## Acceptance Criteria
- [ ] `npm run check:tsconfig-floor` exits 0 on the repo's current `tsconfig.json` (ES2023 target + lib)
- [ ] `npm run test:coverage` automatically invokes `check:tsconfig-floor` via `pretest:coverage`
- [ ] `tests/scripts/check-tsconfig-floor.test.ts` exists and all four cases pass under `npm test`
- [ ] RFC-002 contains an annotation on the deferrable-concern line referencing `check:tsconfig-floor` and marking it resolved
- [ ] `npm run typecheck` passes (zero warnings)
- [ ] Coverage does not regress vs baseline (line ≥ 95%, branch ≥ 75%, function ≥ 90%)
- [ ] All existing tests still pass

## Testing Strategy
- Framework: Node native test runner (`node:test`) — matches all other tests in `tests/scripts/` and `tests/`
- Each test case creates a temp directory, writes a synthetic `tsconfig.json` (or omits it), then calls `spawnSync('node', ['scripts/check-tsconfig-floor.mjs'], { cwd: tmpDir })` and asserts `status` and `stdout`/`stderr`
- Four cases: (1) valid ES2023 → exit 0; (2) `target: "ES2015"` → exit 1 + diagnostic; (3) `lib: ["ES5"]` → exit 1 + diagnostic; (4) no tsconfig.json → exit 1 + not-found message
- Temp dirs cleaned up via `after` hook or inline `rm -rf`
- No UI changes; no E2E tests required

## Documentation Updates
- **`docs/RFC-002-typescript-es2023-floor.md`**: Annotate the deferrable-concern sentence (line 19) to note the concern is now resolved via `npm run check:tsconfig-floor`
- **`CLAUDE.md`**: Add `check:tsconfig-floor` row to the Commands table (the guard is now a named runnable)

## Dependencies
- `scripts/check-tsconfig-floor.mjs` must contain correct tsconfig validation logic (landed in cycle 0091 ✓)
- No external services or env vars required
```
