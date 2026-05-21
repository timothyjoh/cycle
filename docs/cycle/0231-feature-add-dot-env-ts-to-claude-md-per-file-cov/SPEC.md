# SPEC — Cycle 0231: Add dot-env.ts to CLAUDE.md Per-File Coverage Floors List

## Objective
This cycle corrects a documentation drift where `src/engine/dot-env.ts` was introduced in cycle 0225 with a 100% line coverage floor enforced by `scripts/coverage-gate.mjs`, but the human-readable per-file floors list in `CLAUDE.md` was not updated at the same time. Keeping `CLAUDE.md` in sync with `coverage-gate.mjs` ensures contributors can read the documented floors and trust they reflect what the build actually enforces.

## Source Issue
`refl-0225-claude-md-per-file-coverage-floors-missi` — "Add dot-env.ts to CLAUDE.md per-file coverage floors list"

## Scope

### In Scope
- Append `src/engine/dot-env.ts` (100%) to the per-file floors bullet in `CLAUDE.md`'s Coverage policy section

### Out of Scope
- Changes to `scripts/coverage-gate.mjs` or any floor values
- Documentation updates to any file other than `CLAUDE.md`
- Auditing other potential doc-vs-script drift items (separate issue if needed)

## Requirements
- The per-file floors bullet in `CLAUDE.md` must list `src/engine/dot-env.ts` (100%) following the same inline pattern used for `path-utils.ts`, `engine-lock.ts`, `child-env.ts`, and `log-fmt.ts`
- No other files may be modified

## Acceptance Criteria
- [ ] `CLAUDE.md` per-file floors bullet includes `` `src/engine/dot-env.ts` (100%) ``
- [ ] No files other than `CLAUDE.md` are modified
- [ ] `npm test` passes (documentation-only change, no logic affected)

## Testing Strategy
- `npm test` — full suite must pass unchanged (no code was altered)
- Manual grep of `CLAUDE.md` to confirm `dot-env.ts` entry is present and correctly formatted

## Documentation Updates
- **CLAUDE.md**: Add `src/engine/dot-env.ts` (100%) to the per-file floors bullet — this is the sole deliverable of the cycle

## Dependencies
- `src/engine/dot-env.ts` must exist in the repo (it does, introduced in cycle 0225)
- `scripts/coverage-gate.mjs` must already enforce the 100% floor for `dot-env.ts` (it does)
