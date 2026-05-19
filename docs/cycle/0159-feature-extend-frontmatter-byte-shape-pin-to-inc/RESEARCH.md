Have all the data needed. Writing the research document now.

```markdown
# Research: Cycle 0159

## Cycle Context
Cycle 0159 tightens two existing test assertions so the mandatory blank line between the frontmatter closing `---` fence and the issue body is explicitly pinned. Both `tests/issue/materialize.test.ts` and `tests/cli/multi-loop.test.ts` currently end their `expectedFrontmatter` strings at `"---\n"`, leaving the separator blank line un-asserted. The fix is changing `"---\n"` to `"---\n\n"` in both files. No production code changes.

## Current Codebase State

### Relevant Components

- **Frontmatter writer** — `src/issue/materialize.ts:15-27`  
  Constructs frontmatter via `[..., "---", "", text, ""].join("\n")`. The `""` at index 8 (after the closing `"---"`) produces the blank separator line. Final file content ends: `---\n\nfix login bug\n`.

- **Unit test** — `tests/issue/materialize.test.ts:21-33`  
  Test "writes a markdown file with frontmatter to raw/" builds `expectedFrontmatter` ending at `"---\n"` (line 29), then asserts `body.startsWith(expectedFrontmatter)`. Does not cover the `\n` after `---`.

- **Integration test** — `tests/cli/multi-loop.test.ts:189-201`  
  Test "'run \"<text>\" --dry-run' pins raw frontmatter byte-shape (priority: 3 default)" builds `expectedFrontmatter` ending at `"---\n"` (line 197), asserts `body.startsWith(expectedFrontmatter)`. Same gap.

### Existing Patterns to Follow

- **`expectedFrontmatter` string construction**: both tests build the string via `+` concatenation of `"---\n"`, field lines ending with `\n`, and a closing `"---\n"`. Planner appends one more `"\n"` to the terminal `"---\n"` → `"---\n\n"`. No structural change to the test shape.
- **`assert.ok(body.startsWith(...))` pattern**: both tests use `startsWith` for frontmatter and a separate `assert.match(body, /\nfix login bug\n$/)` (or `/\npark this too\n$/)` for the body. The body regex already implicitly relies on the blank line being present (the `\n` before the text could be satisfied by either the fence newline alone or fence + blank line). After the fix, `startsWith` will consume through the blank line, making the body match more precisely anchored.
- **Mutation verification requirement** (SPEC acceptance criterion 3): SPEC requires temporarily patching `src/issue/materialize.ts:23` from `["---", "", text, ""].join("\n")` to `["---", text, ""].join("\n")`, confirming test failure, then reverting. This is a manual verification step, not committed.

### Dependencies & Integration Points

- `src/issue/materialize.ts` — the sole production writer of raw issue files. Its join array at line 23 is `["---", "", text, ""]`, which already emits the blank line. This cycle does not touch it except transiently for mutation check.
- `src/issue/id.ts` — imported by `materialize.ts` for `freeformId`; not relevant to the assertion change.
- `tests/helpers.ts` — exports `expectExactlyOne`; not used in either target test file.

### Test Infrastructure

- **Framework**: Node built-in `node:test` + `node:assert` (strict mode). No external test framework.
- **Runner**: `npm test` → `node --experimental-strip-types --test 'tests/**/*.test.ts'` (via `pretest` build step).
- **Coverage**: `npm run test:coverage` → LCOV output; `npm run check:coverage` enforces per-file floors. `src/issue/materialize.ts` has no explicit floor in `scripts/coverage-gate.mjs` FLOORS table (only `src/engine/*`, `src/cli/run-one.ts`, `src/cli/cleanup.ts`, `scripts/sync-defaults.mjs` are floored). Global floors: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%.
- **TypeScript**: `--experimental-strip-types` at Node ≥ 22.6; no compile step in tests. `tsconfig.json` target ES2023.
- **Directory layout**: `tests/issue/` for unit-level materialize tests; `tests/cli/` for integration-level CLI invocation tests.

## Code References

- `src/issue/materialize.ts:23` — `["---", "", text, ""].join("\n")` — the `""` at index 1 (after `"---"`) is the blank separator line. Mutation target for verification.
- `tests/issue/materialize.test.ts:29` — `"---\n"` — the terminal line of `expectedFrontmatter` that must become `"---\n\n"`.
- `tests/cli/multi-loop.test.ts:197` — `"---\n"` — same terminal line in the integration test's `expectedFrontmatter`.
- `tests/cli/multi-loop.test.ts:159` — test name: "'run \"<text>\" --dry-run' pins raw frontmatter byte-shape (priority: 3 default)".
- `tests/issue/materialize.test.ts:8` — test name: "writes a markdown file with frontmatter to raw/".

## Open Questions

- None. Both change sites are precisely located, the production emission is already correct, and SPEC fully specifies the mutation-verification procedure.
```
