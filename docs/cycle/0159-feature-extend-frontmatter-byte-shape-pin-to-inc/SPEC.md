# SPEC — Cycle 0159: Extend Frontmatter Byte-Shape Pin to Include Mandatory Blank Line

## Objective
Tighten two existing test assertions so the mandatory blank line between the frontmatter closing `---` fence and the issue body is explicitly pinned. Currently both `tests/issue/materialize.test.ts` and `tests/cli/multi-loop.test.ts` end their `expectedFrontmatter` strings at `"---\n"`, leaving the separator blank line un-asserted. A writer bug that drops that blank line would pass both tests silently. This cycle changes `"---\n"` to `"---\n\n"` in both files — no production code changes.

## Source Issue
`refl-0043-frontmatter-byte-shape-pin-misses-blank` — "Extend frontmatter byte-shape pin to include mandatory blank line between closing fence and body"

## Scope

### In Scope
- Change `expectedFrontmatter` in `tests/issue/materialize.test.ts` to end with `"---\n\n"`.
- Change `expectedFrontmatter` in `tests/cli/multi-loop.test.ts` to end with `"---\n\n"`.
- Confirm a mutation (temporarily removing the blank line from `materialize.ts`) breaks at least one test.

### Out of Scope
- Any changes to production code in `src/`.
- The unrelated log-file asymmetry between `cycle run --dry-run` and `cycle drop` (separate issue).
- Adding new test cases beyond the two pinned assertions.

## Requirements
- `expectedFrontmatter` in both test files must end with `"---\n\n"` (two newlines: fence newline + blank-line separator).
- No production source files modified.
- Full test suite continues to pass after the change.

## Acceptance Criteria
- [ ] `tests/issue/materialize.test.ts` `expectedFrontmatter` string ends with `"---\n\n"`.
- [ ] `tests/cli/multi-loop.test.ts` `expectedFrontmatter` string ends with `"---\n\n"`.
- [ ] Mutation check: temporarily change `materialize.ts` line 23 from `["---", "", text, ""].join("\n")` to `["---", text, ""].join("\n")` and confirm at least one test fails; revert the mutation before committing.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).
- [ ] Coverage floors not regressed (`npm run test:coverage`).

## Testing Strategy
- Node built-in test runner (`node:test`) — no new framework needed.
- Both assertions are unit-level (`materialize.test.ts`) and integration-level (`multi-loop.test.ts`); tightening both provides defense-in-depth.
- Mutation verification: manual one-line flip in `src/issue/materialize.ts`, run `npm test`, confirm failure, revert.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No changes — this is a test-only cycle with no new conventions.
- **README.md**: No user-facing behavior change.

## Dependencies
- `src/issue/materialize.ts` must emit `["---", "", text, ""].join("\n")` (it does; this cycle does not change it).
- No external services or env vars required.
