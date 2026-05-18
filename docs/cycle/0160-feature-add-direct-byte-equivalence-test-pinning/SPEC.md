# SPEC — Cycle 0160: Add Direct Byte-Equivalence Test Pinning `cycle drop` and `cycle run "<text>"` Frontmatter Shape

## Objective
Add a single end-to-end test that asserts `cycle drop "<text>"` and `cycle run "<text>" --dry-run` produce byte-identical frontmatter (after normalizing timestamp-dependent fields). Currently two independent per-command tests pin each command's frontmatter shape separately, but no test catches silent divergence between the two call sites if both are updated in lockstep in the same diff.

## Source Issue
`refl-0043-no-direct-byte-equivalence-check-between` — "Add direct byte-equivalence test pinning `cycle drop` and `cycle run \"<text>\"` frontmatter shape"

## Scope

### In Scope
- One new test in `tests/cli/multi-loop.test.ts` that runs both commands against separate temp roots and asserts normalized frontmatter byte-equality.

### Out of Scope
- Modifying existing `drop` or `run --dry-run` frontmatter-shape tests.
- Refactoring `materializeFreeformIssue` or collapsing the two call sites into a shared helper (that was explicitly deferred in cycle 0043).
- Adding a `--priority` flag to any command that doesn't already support it.

## Requirements
- Test invokes the real built CLI binary (`dist/cycle.js`) for both commands — no direct `materializeFreeformIssue` calls.
- Both invocations use identical text and identical `--priority` value (e.g., `--priority 2`) so field values are comparable.
- Each invocation runs in its own isolated `mkdtemp` root so neither command's side-effects contaminate the other.
- Normalization replaces the `id:` line with `id: <ID>` and the `added_at:` line with `added_at: <TS>` before comparison.
- `assert.strictEqual` is used for the final comparison; the failure message must show both normalized blocks.
- Test cleans up both temp roots in `finally`.

## Acceptance Criteria
- [ ] New test exists in `tests/cli/multi-loop.test.ts` and is named to make its intent clear (e.g., `"'drop' and 'run \"<text>\"' produce byte-equal frontmatter after normalizing id and added_at"`).
- [ ] Test runs `cycle drop "<text>" --priority N` against temp root A and reads the resulting raw `.md` file.
- [ ] Test runs `cycle run "<text>" --dry-run --priority N` against temp root B and reads the resulting raw `.md` file.
- [ ] After replacing `id: <anything>` → `id: <ID>` and `added_at: <anything>` → `added_at: <TS>` in both strings, `assert.strictEqual(normalizedA, normalizedB)` passes.
- [ ] Failure message shows both normalized frontmatter blocks.
- [ ] All 504+ existing tests still pass.
- [ ] Coverage does not regress vs. master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).
- [ ] `npm run typecheck` exits clean.

## Testing Strategy
- Node built-in `node:test` + `node:assert` (matches existing test file conventions).
- `spawnSync` for both CLI invocations (matches existing pattern in file).
- Normalization via `String.replace(/^id: .+$/m, "id: <ID>")` and `String.replace(/^added_at: .+$/m, "added_at: <TS>")` before `strictEqual`.
- Failure message: `` `frontmatter diverged:\n--- drop ---\n${normA}\n--- run --dry-run ---\n${normB}` ``.
- No E2E browser testing required (CLI-only change).

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention changes — existing cardinality-pin and `expectExactlyOne` rules are unaffected.
- **README.md**: No user-facing behavior change.

## Dependencies
- `refl-0043-frontmatter-byte-shape-pin-misses-blank` must already be merged (it is — cycle 0159 landed it). The mandatory blank line between closing `---` and the body is now part of the byte shape being compared.
- `cycle run "<text>" --dry-run` must skip log file creation (cycle 0158 landed this).
- Built `dist/cycle.js` artifact — `npm run build` runs automatically via `pretest`.
