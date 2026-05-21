# SPEC — Cycle 0206: Add stripFences Helper to Triage Parse Path

## Objective
Add a deterministic `stripFences` helper that strips markdown code-fence wrappers before `JSON.parse` in `validateTriageOutput`. Cycle 0205 added a prompt-level no-fences instruction; this adds the code-side fallback so fence-wrapped responses are recovered rather than burned against the retry budget. Eliminates the dominant parse-failure class (76% of observed failures) at near-zero cost.

## Source Issue
`refl-0205-triage-parse-path-has-no-code-side-fence` — "Add stripFences helper to triage parse path for deterministic fence removal"

## Scope

### In Scope
- `stripFences(s: string): string` pure helper — strips leading ` ```json ` or bare ` ``` ` opener and trailing ` ``` ` closer; passes through unfenced input unchanged
- Applied unconditionally before `JSON.parse` at `src/engine/triage.ts:394` inside `validateTriageOutput`
- Unit tests covering all four cases: no-fence passthrough, ` ```json ` wrapped, bare ` ``` ` wrapped, whitespace-padded variants

### Out of Scope
- Applying fence-stripping to any step other than triage (reflection, spec, etc.)
- Changing retry policy or error categorization
- Removing the prompt-level no-fences instruction added in cycle 0205

## Requirements
- `stripFences` must be a pure `string → string` function with no side effects; safe to call unconditionally
- Placement: either `src/engine/triage.ts` (local) or `src/engine/log-fmt.ts` (shared) — choose the location that best fits existing module boundaries
- Applied immediately before the `JSON.parse` call at line 394 in `validateTriageOutput`
- Must not alter already-valid JSON (no-fence passthrough must be exact)

## Acceptance Criteria
- [ ] `stripFences(s: string): string` helper exists in `src/engine/triage.ts` or `src/engine/log-fmt.ts`
- [ ] Applied unconditionally before `JSON.parse` in `validateTriageOutput` (line 394)
- [ ] Strips leading ` ```json ` or bare ` ``` ` block opener and trailing ` ``` ` closer
- [ ] Passes through input with no fences unchanged (exact identity)
- [ ] Unit tests cover: no-fence passthrough, ` ```json ` wrapped input, bare ` ``` ` wrapped input, whitespace-padded variants
- [ ] Per-file coverage floor for `src/engine/triage.ts` (95%) maintained
- [ ] All existing tests still pass (`npm test`)
- [ ] No compiler/linter warnings introduced (`npm run typecheck`)

## Testing Strategy
- Test framework: Node native test runner (matches existing test conventions)
- Key scenarios: identity passthrough (no fences), ` ```json\n...\n``` `, bare ` ```\n...\n``` `, leading/trailing whitespace around fences
- Tests co-located with existing triage tests or in the triage test file
- Run `npm run test:coverage` and `npm run check:coverage` to verify 95% floor holds

## Documentation Updates
- **CLAUDE.md**: No change required — `stripFences` is implementation detail, not a public convention
- **docs/ENGINE.md**: Add one-line note to triage section: code-side fence strip applied before JSON.parse as deterministic fallback to prompt-level instruction
- **BRIEF.md / README.md**: No user-facing change

## Dependencies
- `src/engine/triage.ts` at line 394 — existing `validateTriageOutput` function
- Cycle 0205 already shipped (prompt-level no-fences instruction in place); this adds the code-side complement
