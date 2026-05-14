Source raw recovered from git history, current test file confirms two loose anchors at `tests/cli/halt.test.ts:266-267`. Emitting spec.

```markdown
# SPEC — Cycle 0061: Tighten halt-test frontmatter regex anchors to full-line match

## Objective
Right-anchor two assertions in `tests/cli/halt.test.ts` (`failed_step` and `failed_attempts`) so they match the same strict full-line form (`/^…$/m`) already used by the adjacent `last_cycle_id` assertion. Pure test tightening — no production code change. Removes future false-positive risk if the workflow step name or attempt counters ever grow (`verify_extended`, `failed_attempts: 11`).

## Source Issue
`refl-0025-halt-test-frontmatter-regex-anchors-loos` — "Tighten halt-test frontmatter regex anchors to full-line match"

## Scope

### In Scope
- Replace `/^failed_step: verify/m` → `/^failed_step: verify$/m` at `tests/cli/halt.test.ts:266`.
- Replace `/^failed_attempts: 1/m` → `/^failed_attempts: 1$/m` at `tests/cli/halt.test.ts:267`.

### Out of Scope
- Sweeping other test files for similar loose-anchor patterns. If a similar gap is noticed incidentally, surface it in REFLECTION.md — do not fix here.
- Any change to `src/cli.ts` `terminalDrain`, queue logic, blocked propagation, or the halt fixture itself.
- Adding new test cases. The existing assertions are simply being hardened.

## Requirements
- Both edited assertions use the strict right-anchored form `/^<key>: <value>$/m`, matching the existing `last_cycle_id` assertion on the next line.
- No other lines in `tests/cli/halt.test.ts` are touched.
- No production source files are touched.

## Acceptance Criteria
- [ ] `tests/cli/halt.test.ts:266` reads `assert.match(failedBody, /^failed_step: verify$/m);`.
- [ ] `tests/cli/halt.test.ts:267` reads `assert.match(failedBody, /^failed_attempts: 1$/m);`.
- [ ] `npm test` passes (full suite, including the halt test).
- [ ] `npm run typecheck` passes with no warnings.
- [ ] Coverage gates hold vs the master baseline (line ≥ 95%, branch ≥ 75%, func ≥ 90%; per-file `src/engine/triage.ts` ≥ 95%). No regression expected — test-file change is coverage-neutral.

## Testing Strategy
- Framework: Node's native test runner (already in use across the repo).
- Primary verification: `npm test` — the existing halt-fixture test exercises the same assertions, so the tightened regexes must continue to match the deterministic fixture output (`failed_step: verify`, `failed_attempts: 1`).
- Mutation sanity check (optional, by inspection): the new patterns reject `failed_step: verify_extended` and `failed_attempts: 11`, where the old patterns would have accepted them. No new test required — the change is a pin-tightening within an existing test.
- No UI surface — no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No change. The convention being applied (full-line anchors in halt assertions) is already implicit in the adjacent `last_cycle_id` line; this cycle aligns the other two assertions to it rather than introducing a new rule.
- **README.md**: No change. Internal test hardening, no user-facing behavior.

Documentation is part of "done" — code without updated docs is incomplete. (Nothing to update here.)

## Dependencies
- None beyond the existing repo state. Fixture is deterministic (`max_cycle_attempts: 1`, workflow step name `verify`), so the strict patterns will continue to match without any other change.
```
