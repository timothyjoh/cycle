Now I have everything. Writing the spec.

# SPEC — Cycle 0135: Add unit tests for scripts/coverage-gate.mjs (LCOV parser + FLOORS + exit codes)

## Objective
`scripts/coverage-gate.mjs` is a load-bearing per-file coverage gate with 6 floor entries and exit-code semantics (0/1/2), but it has zero unit or integration tests. The absolute-path normalization branch (line 40) is dead under Node 22's relative `SF:` emission and has never been exercised. This cycle adds `tests/scripts/coverage-gate.test.ts` with 5 fixture-driven child-process cases covering all exit codes and the normalization branch, so gate regressions fail loudly.

## Source Issue
`refl-0049-coverage-gate-mjs-has-no-unit-tests-lcov` — "Add unit tests for scripts/coverage-gate.mjs (LCOV parser + FLOORS + exit codes)"

## Scope

### In Scope
- `tests/scripts/coverage-gate.test.ts` with 5 fixture-string cases (see Acceptance Criteria)
- Each case spawns `coverage-gate.mjs` as a child process with a `tmpDir/.cycle/coverage.lcov` fixture

### Out of Scope
- Coverage instrumentation of `scripts/**` (separate issue `refl-0048`)
- Growing the `FLOORS` table
- Refactoring `coverage-gate.mjs` internals to export functions

## Requirements
- Tests use `node:test` + `node:assert` to match existing test convention
- Tests spawn the script via `spawnSync(process.execPath, ["scripts/coverage-gate.mjs"], { cwd: tmpDir })` — no refactor leak
- Fixture LCOV strings are minimal and inline (no separate fixture files)
- Test file lives at `tests/scripts/coverage-gate.test.ts`
- Each test case isolates state via its own `mkdtemp` tmpdir

## Acceptance Criteria
- [ ] **Passing path** — LCOV with `src/engine/triage.ts` at ≥95% line coverage → exit `0`, no stderr
- [ ] **Failing path** — LCOV with `src/engine/triage.ts` at <95% line coverage → exit `1`, stderr names the file and actual-vs-floor numbers
- [ ] **Configured path missing from LCOV** — LCOV lacks any `SF:` block for `src/engine/triage.ts` → exit `2`, stderr explains missing block
- [ ] **Absent LCOV file** — `.cycle/coverage.lcov` does not exist → exit `2`, stderr explains missing file
- [ ] **Absolute `SF:` normalized** — LCOV emits `SF:/abs/path/to/repo/src/engine/triage.ts`; gate resolves to relative key and exits `0` for a passing fixture
- [ ] All existing tests still pass (`npm test`)
- [ ] No compiler/linter warnings introduced (`npm run typecheck`)

## Testing Strategy
- Framework: `node:test` + `node:assert` (matches all existing test files)
- Approach: child-process (`spawnSync`) — preserves CLI contract, exercises `path.relative(cwd, …)` normalization end-to-end
- All 5 issue-specified cases covered; fixture LCOV strings inlined in the test file
- Each test uses its own `mkdtemp` tmpdir and cleans up with `rm(dir, { recursive: true })`
- The absolute-path case uses a fake absolute prefix (e.g. `/fake/repo/root`) as cwd override so the normalization branch is live without needing the real repo root

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — coverage policy section already documents `scripts/coverage-gate.mjs` as the enforcement mechanism
- **README.md**: No user-facing changes

## Dependencies
- `scripts/coverage-gate.mjs` must exist at repo root (already present)
- Node ≥ 22.6 with `--experimental-strip-types` (already enforced per CLAUDE.md)
- `tests/scripts/` directory created as part of this cycle
