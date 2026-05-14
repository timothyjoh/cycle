```markdown
# SPEC — Cycle 0055: Remove redundant ParsedTriageOutput type alias

## Objective
Collapse the redundant `ParsedTriageOutput` type alias in `src/engine/triage.ts` into the canonical `TriageOutput` name so there is exactly one type identifier for the triage agent's parsed+validated output shape. Two names for the same structural type invite silent drift if one definition is later edited without the other; eliminating the alias removes that risk at zero behavioral cost.

## Source Issue
`refl-0023-parsedtriageoutput-is-a-redundant-type-a` — "Remove redundant ParsedTriageOutput type alias in triage.ts"

## Scope

### In Scope
- Replace every in-file reference to `ParsedTriageOutput` in `src/engine/triage.ts` with `TriageOutput` and delete the `type ParsedTriageOutput = TriageOutput;` line.

### Out of Scope
- Restructuring the validator pipeline or any change to the parse-vs-validate boundary.
- Changing the JSON contract emitted by the triage agent.
- Touching any other type alias in `triage.ts` (or elsewhere) that is not the `ParsedTriageOutput` ↔ `TriageOutput` pair.
- Renaming `TriageOutput` itself or splitting it into a `Raw` vs validated pair (option 2 from the issue) — the three current use sites carry no parse-vs-validated distinction, so option 1 (inline+delete) applies.

## Requirements
- After the change, `rg -n "ParsedTriageOutput" src tests` returns zero matches.
- `TriageOutput` remains declared exactly once at `src/engine/triage.ts:51`.
- The three call sites currently referencing `ParsedTriageOutput` (`src/engine/triage.ts:65, 68, 76`) compile against `TriageOutput` without further edits.
- No runtime code path changes; this is a pure structural rename of an erased type.

## Acceptance Criteria
- [ ] `type ParsedTriageOutput = TriageOutput;` is removed from `src/engine/triage.ts`.
- [ ] Every prior reference to `ParsedTriageOutput` in `src/engine/triage.ts` now reads `TriageOutput`.
- [ ] `rg -n "ParsedTriageOutput"` across the repo returns no matches.
- [ ] `npm run typecheck` passes with no warnings.
- [ ] `npm test` passes (full suite, currently 381/381).
- [ ] `npm run test:coverage` shows no per-file regression for `src/engine/triage.ts` against the master baseline; aggregate coverage stays ≥ 95% line / ≥ 75% branch / ≥ 90% function. The per-file floor `src/engine/triage.ts ≥ 95% line` enforced by `scripts/coverage-gate.mjs` must still pass.
- [ ] No behavioral change observable in test output (test names, counts, and assertions unchanged).

## Testing Strategy
- Rely on the existing Node native test runner suite — this is a type-only rename of an erased TypeScript alias, so no new tests are warranted (and adding any would couple tests to an internal type name).
- Verification is the existing test suite + `tsc --noEmit`; the typechecker is the actual semantic guard for this change.
- No E2E coverage required: no UI surface, no CLI surface, no on-disk format affected.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No update required. The "Architecture quick reference" entry for triage describes behavior (file moves, `tbd.jsonl` mutations, validator semantics) and does not reference the `ParsedTriageOutput` identifier.
- **README.md**: No update required. README documents user-facing CLI behavior; this change is internal to a non-exported TypeScript type.

This cycle is a pure internal rename; "docs updated" here means *confirmed no doc references the dropped name*, which a grep for `ParsedTriageOutput` across `README.md`, `CLAUDE.md`, `BRIEF.md`, and `docs/**/*.md` will verify during the build step.

## Dependencies
- None. The change is confined to a single file (`src/engine/triage.ts`) and depends only on the existing `TriageOutput` declaration on line 51, which is already in place.
- No external services, no env vars, no migration.
```
