# SPEC — Cycle 0136: Resolve PLAN-vs-impl drift on sync-state write condition

## Objective
`scripts/sync-defaults.mjs` writes `.cycle/.sync-state.json` unconditionally on every run, including all-divergent runs that copy nothing. Cycle 0048's PLAN.md specified a conditional write ("if anything was copied"), creating a documented plan-vs-impl drift. This cycle resolves the drift by choosing option 2: documenting the unconditional write behavior in `docs/sync-defaults.md` so operators understand that `{}` in `.sync-state.json` is the expected first-run state when every destination is locally divergent.

## Source Issue
`refl-0048-plan-vs-impl-drift-on-conditional-state` — "Resolve PLAN-vs-impl drift on sync-state write condition (guard write OR document unconditional write)"

## Scope

### In Scope
- Update `docs/sync-defaults.md` to document that `.cycle/.sync-state.json` is (re)written on every successful invocation, including all-skip runs
- Note that an empty `{}` body is the expected first-run shape when every destination is locally divergent

### Out of Scope
- Guarding the write behind a `copied.length > 0` check (option 1 — deferred)
- Schema changes to `.sync-state.json`
- Any change to divergence detection logic (`src_sha256` / `dst_sha256` comparison)
- Force-overwrite path (`--force` / `CYCLE_SYNC_DEFAULTS_FORCE=1`)
- New tests (option 2 is doc-only)

## Requirements
- `docs/sync-defaults.md` must explicitly state that `.cycle/.sync-state.json` is written on every successful `sync-defaults` run, not only when files are copied
- The doc must state that `{}` (empty object) is the expected content when every destination is locally divergent and nothing was copied
- The addition must be consistent with existing doc language and code comments in `scripts/sync-defaults.mjs`

## Acceptance Criteria
- [ ] `docs/sync-defaults.md` contains an explicit statement that `.sync-state.json` is written unconditionally on every successful invocation
- [ ] `docs/sync-defaults.md` states that `{}` is the expected state-file body when all destinations are divergent
- [ ] No code changes in `scripts/sync-defaults.mjs`
- [ ] All existing tests still pass (`npm test`)
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- No new tests required (doc-only change)
- Run `npm test` to confirm existing sync-defaults-guard tests still pass unmodified
- Manually verify the doc addition is internally consistent with the existing "When divergence is detected" block

## Documentation Updates
- **docs/sync-defaults.md**: Add a section or inline note after the "When divergence is detected" block explaining the unconditional write and `{}` first-run shape
- **CLAUDE.md / README.md**: No changes required — CLAUDE.md links to docs/sync-defaults.md which will carry the updated explanation

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `docs/sync-defaults.md` must exist (it does: `docs/sync-defaults.md`)
- `scripts/sync-defaults.mjs` must remain unchanged
