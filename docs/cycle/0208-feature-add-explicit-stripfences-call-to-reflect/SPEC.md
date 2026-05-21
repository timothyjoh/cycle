# SPEC — Cycle 0208: Add explicit stripFences call to reflection parseWithRepair

## Objective
`parseWithRepair` in `src/engine/reflection.ts` incidentally skips markdown fence prefixes as a side effect of `trimToLastBalancedClose` scanning forward to the first `{` or `[`. This is fragile: prose containing a `{` before the fence (e.g. `Error in step {build}: ...`) causes the scanner to latch onto the wrong brace, producing a parse failure or corrupt result. This cycle makes fence removal an explicit, documented first step in `parseWithRepair` — matching the pattern already established in triage's `validateOutput`.

## Source Issue
`refl-0206-reflection-parse-path-uses-incidental-tr` — "Add explicit stripFences call to reflection parseWithRepair"

## Scope

### In Scope
- Add `s = stripFences(s)` as first statement in `parseWithRepair`, before any `JSON.parse` or `trimToLastBalancedClose` call
- Import `stripFences` from `./log-fmt` in `src/engine/reflection.ts`
- Unit test covering the prose-with-brace hazard case

### Out of Scope
- Changes to `trimToLastBalancedClose` internals
- Changes to `stripFences` implementation in `log-fmt.ts`
- Any other parse path hardening (triage, documentation agent, etc.)

## Requirements
- `stripFences(s)` is called at the very start of `parseWithRepair`, before the initial `JSON.parse` attempt
- `stripFences` is imported from `./log-fmt`
- No change to `parseWithRepair`'s external signature or return type

## Acceptance Criteria
- [ ] `stripFences(s)` is the first statement in `parseWithRepair`, before any `JSON.parse` or `trimToLastBalancedClose` invocation
- [ ] New unit test: input `Error in step {build}:\n\`\`\`json\n{"key":"val"}\n\`\`\`` is parsed to `{ key: 'val' }` without error
- [ ] All existing reflection parse tests continue to pass
- [ ] `src/engine/reflection.ts` coverage floor maintained at 95%
- [ ] All existing tests still pass
- [ ] No compiler/linter warnings introduced

## Testing Strategy
- Framework: Node test runner (existing pattern in `tests/engine/reflection.test.ts`)
- Happy path: fenced JSON after prose-with-brace is correctly parsed
- Edge case: plain unfenced JSON still works (regression)
- Edge case: no fence, no brace in prose — existing repair path still functions
- No E2E tests needed; pure unit behavior

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes; `stripFences` and `log-fmt.ts` already documented
- **docs/ENGINE.md**: Update reflection parse-path description to note the explicit `stripFences` call

## Dependencies
- `stripFences` already exported from `src/engine/log-fmt.ts` (added cycle 0206) — no new utility needed
- `tests/engine/reflection.test.ts` already exists
