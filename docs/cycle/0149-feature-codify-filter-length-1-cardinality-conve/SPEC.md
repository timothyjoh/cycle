Now I have everything. Writing the spec.

```markdown
# SPEC — Cycle 0149: Codify filter().length===1 Cardinality Convention

## Objective
Document the `events.filter(predicate).length === 1` cardinality-pinning convention for exactly-once engine events in CLAUDE.md, then migrate the 8 known offender sites in `tests/cli/halt.test.ts` and `tests/engine/reflection.test.ts` from existence-only `find(...)` to the stricter `filter(...).length === 1` form. This closes the patchwork cardinality coverage that lets double-emission regressions slip through undetected.

## Source Issue
`refl-0051-filter-length-cardinality-pattern-applie` — "Codify filter().length===1 cardinality convention in CLAUDE.md + migrate 8 engine.halted/reflection.summary offenders"

## Scope

### In Scope
- Add a "Test conventions" subsection to `CLAUDE.md` documenting the `filter(...).length === 1` rule for exactly-once events, with rationale linking cycles 0022 and 0051.
- Introduce a generic `expectExactlyOne(events, eventName)` helper (the sibling issue `refl-0051-engine-paused-cardinality-pins-missing-o-expect-single-paused-helper` was superseded and never shipped a helper, so this cycle introduces one).
- Migrate the 8 offender sites to use `filter(...).length === 1` (via `expectExactlyOne` where appropriate), preserving all downstream payload assertions.

### Out of Scope
- Events that legitimately fire ≥1 time (per-loop-iteration events, etc.).
- Migrating `engine.paused` sites in `tests/engine/triage.test.ts` — those were part of the superseded sibling and may be addressed in a follow-on cycle.
- Any other event types not listed as the 8 offenders.

## Requirements
- CLAUDE.md gains a documented rule that engine events specified as "fires exactly once" MUST be pinned with `filter(...).length === 1`, not `find(...) !== undefined`.
- A generic `expectExactlyOne(events: EngineEvent[], eventName: string): EngineEvent` helper is added in the relevant test file(s) or a shared test utility.
- Each of the 8 offender sites is migrated; each still binds the returned event for payload assertions (not just counts).
- No behavioral regression in any test assertion — payload checks must still pass.

## Acceptance Criteria
- [ ] `CLAUDE.md` has a "Test conventions" subsection documenting the `filter(...).length === 1` rule with rationale (cycles 0022/0051).
- [ ] `expectExactlyOne(events, eventName)` helper exists, usable across both `halt.test.ts` and `reflection.test.ts`.
- [ ] `tests/cli/halt.test.ts` lines 119 and 187 (`engine.halted` find-existence) migrated to `expectExactlyOne`.
- [ ] `tests/engine/reflection.test.ts` lines 77, 112, 159, 182, 257, 357 (`reflection.summary` find-existence) migrated to `expectExactlyOne`.
- [ ] All downstream payload assertions on the migrated sites still pass (no behavioral regression).
- [ ] `npm test` passes (all existing tests green).
- [ ] Coverage gates hold — no per-file floor regression.
- [ ] No TypeScript/compiler warnings introduced.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node built-in `node:test` + `assert` (existing framework).
- After migration: run `npm test` to verify all tests green.
- Run `npm run test:coverage` to verify coverage gates hold.
- Manual mutation check (do not commit): temporarily add a second `log.emit("engine.halted", ...)` call in the SUT; confirm both migrated halt.test.ts sites now fail. Revert before commit.
- Similarly, temporarily double-emit `reflection.summary` in the SUT; confirm migrated reflection.test.ts sites fail. Revert before commit.
- No new test files needed — changes are migrations within existing test files.

## Documentation Updates
- **CLAUDE.md**: Add "Test conventions" subsection under the Architecture or Commands section documenting the `filter(...).length === 1` rule for exactly-once engine events, with rationale referencing cycles 0022 and 0051.
- **README.md**: No change required.

## Dependencies
- Node ≥ 22.6 (already enforced).
- Sibling issue `refl-0051-engine-paused-cardinality-pins-missing-o-expect-single-paused-helper` is in `done/` (superseded), so no blocking dep — proceed directly.
- Existing `EngineEvent` type must be importable in test helpers (already used throughout both test files).
```
