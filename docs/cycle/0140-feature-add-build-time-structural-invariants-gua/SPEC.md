```markdown
# SPEC — Cycle 0140: Add Build-Time Structural-Invariants Guard

## Objective
Add `scripts/structural-invariants.mjs`, a regex-based build-time checker that enforces "exactly one of X" source-code invariants — seeded with the `triage.ts` `childIds` single-Set rule from cycle 0050. Wire it into the existing `posttest:coverage` fan-out so any CI run that re-introduces the duplicate-Set anti-pattern fails before reaching publish. The gate is proven load-bearing by a regression test against a fixture file.

## Source Issue
`refl-0050-structural-invariant-checks-not-enforced` — "Add build-time structural-invariants guard (seed with triage.ts childIds single-Set rule)"

## Scope

### In Scope
- `scripts/structural-invariants.mjs` with an in-file `INVARIANTS` table (two entries for `childIds`)
- Wire via a new `check:invariants` npm script called from `posttest:coverage` (extend the hook to fan out to both `check:coverage` and `check:invariants`)
- One regression test in `tests/scripts/structural-invariants.test.ts` using a fixture file with an injected violation, asserting exit code 1 and stderr content
- `CLAUDE.md` structural-invariants policy section near the Coverage policy section

### Out of Scope
- AST-based checking (regex over source text is sufficient)
- Invariants for any file other than `src/engine/triage.ts`
- Extracting `INVARIANTS` to an external config file

## Requirements
- Script reads each target file, counts regex matches, compares to `expected`, emits a structured stderr line (`file`, `pattern`, `actual`, `expected`, `reason`) on mismatch, exits non-zero on any failure
- Script exits 0 on a clean checkout of master
- `INVARIANTS` table lives in-file as the single source of truth (same posture as `FLOORS` in `coverage-gate.mjs`)
- `check:invariants` runs as part of `posttest:coverage` so it executes on every `npm run test:coverage` invocation
- Regression test uses a fixture file (not the real `src/engine/triage.ts`) to avoid polluting the source tree; fixture contains an intentional second `const childIds = new Set` line

## Acceptance Criteria
- [ ] `scripts/structural-invariants.mjs` exists with two `INVARIANTS` entries for `triage.ts` `childIds`
- [ ] `npm run check:invariants` exits 0 on clean master, exits 1 with structured stderr when a violation is present
- [ ] `posttest:coverage` in `package.json` fans out to both `check:coverage` and `check:invariants`
- [ ] Regression test asserts: script exits 1 against a fixture with the duplicate-Set violation, and stderr includes the file path, pattern description, actual count, and expected count
- [ ] Regression test asserts: script exits 0 against a fixture with only a single `const childIds = new Set` line
- [ ] All existing tests still pass (`npm test`)
- [ ] `npm run typecheck` reports no errors
- [ ] `CLAUDE.md` has a `## Structural-invariants policy` section referencing `scripts/structural-invariants.mjs` as the single source of truth for the `INVARIANTS` table

## Testing Strategy
- Framework: Node built-in test runner (`node:test`) with `--experimental-strip-types`, consistent with existing `tests/scripts/` files
- Fixture files in `tests/fixtures/structural-invariants/` (two `.ts` fixtures: one clean, one with violation)
- Spawn `scripts/structural-invariants.mjs` as a subprocess via `spawnSync` with the fixture path substituted; inspect `status` and `stderr`
- No mocking — exercise the real script end-to-end

## Documentation Updates
- **CLAUDE.md**: Add `## Structural-invariants policy` section near `## Coverage policy`, stating: "The `INVARIANTS` table in `scripts/structural-invariants.mjs` is the single source of truth for build-time structural rules. Extend it to register new invariants; enforced via `npm run check:invariants` (runs automatically after `test:coverage`)."
- **README.md**: No user-facing change required

## Dependencies
- `src/engine/triage.ts` must have exactly one `const childIds = new Set` line (verified: line 438)
- `scripts/coverage-gate.mjs` exists as the pattern reference for script shape
- Existing `posttest:coverage` hook in `package.json` must be extended (currently calls only `node scripts/coverage-gate.mjs`)
```
