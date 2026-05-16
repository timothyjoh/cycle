Enough context gathered. Writing the RESEARCH.md now.

```markdown
# Research: Cycle 0097

## Cycle Context

This cycle adds a `## Prior Deliverable Verification` clause to `src/defaults/prompts/spec.md`
requiring the spec agent to explicitly name each prior-cycle artifact it references, verify each
is present via a shell command, and treat absence as a gap that must be added to acceptance
criteria. The dogfood mirror (`.cycle/prompts/spec.md`) must be kept byte-identical, and a
pinning test (`tests/defaults/spec-prompt-prior-deliverable-verification.test.ts`) must assert
both the clause's presence and the parity — following the same pattern as the plan and review
prompt pinning tests.

## Current Codebase State

### Relevant Components

- **Default spec prompt**: 113 lines, no `## Prior Deliverable Verification` section, no
  self-validation requirement — `src/defaults/prompts/spec.md:1-113`
- **Dogfood spec prompt**: byte-identical to default (confirmed via `diff`; no divergence) —
  `.cycle/prompts/spec.md:1-113`
- **Pinning test (plan)**: structural + parity assertions for plan/review prompts —
  `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72`
- **Pinning test (review, doc-claim pass)**: structural + parity assertions for review prompt —
  `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-43`
- **sync-defaults script**: copies `src/defaults/* → .cycle/*`, guards against local divergence —
  `scripts/sync-defaults.mjs`
- **Sync-state file**: `.cycle/.sync-state.json` tracks per-file sha256 pairs; spec.md entry
  present (no divergence flag)

### Existing Patterns to Follow

- **Pinning test structure**: `tests/defaults/<feature>.test.ts` — imports `node:test`,
  `node:assert`, `node:fs/promises`; declares `const SRC` and `const DOG` path constants at top;
  runs `readFile(SRC, "utf8")` then `assert.match(body, /regex/)` or `assert.ok(body.includes(…))`
  for structural assertions; final test does `Promise.all([readFile(SRC), readFile(DOG)])` and
  `Buffer.compare(src, dog) === 0` for parity — `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72`
- **Byte-identical parity test message**: follows shape
  `"src/defaults/prompts/X.md and .cycle/prompts/X.md must match byte-for-byte"` —
  `tests/defaults/plan-prompt-spec-traceability.test.ts:57-63`
- **Section header assertion**: `assert.match(body, /^## Section Name$/m)` —
  `tests/defaults/plan-prompt-spec-traceability.test.ts:11-13`
- **Phrase inclusion assertion**: `assert.ok(body.includes("exact phrase"), "missing phrase")` —
  `tests/defaults/plan-prompt-spec-traceability.test.ts:16-20`
- **sync-defaults invocation**: `npm run sync-defaults` copies src→dogfood; `--force` overrides
  divergence guard — `scripts/sync-defaults.mjs`, documented in `CLAUDE.md`
- **No-divergence state on spec.md**: direct copy (`cp`) is sufficient since files are already
  byte-identical; `npm run sync-defaults` will also work

### Dependencies & Integration Points

- **Test runner**: Node native test runner via `node --test --experimental-strip-types`; tests
  auto-discovered by glob — `package.json:25`
- **Test glob**: no explicit glob in package.json test command, so Node discovers all `*.test.ts`
  under `tests/` recursively — `package.json:25`
- **Coverage exclusions**: `tests/**` excluded from coverage report, so new test file does not
  affect coverage metrics — `package.json:27`
- **`posttest:coverage`**: runs `scripts/coverage-gate.mjs` after `test:coverage`; new test adds
  no new `src/` code, so coverage baseline is unaffected — `package.json:28`
- **`pretest`**: builds `dist/cycle.js` before test run; irrelevant to prompt-pinning tests —
  `package.json:24`

### Test Infrastructure

- **Framework**: Node.js native test runner (`node:test` / `node:assert`), TypeScript via
  `--experimental-strip-types` (no transpile step)
- **Conventions**: test files in `tests/defaults/` for prompt/script pinning; `test("description",
  async () => { … })` shape; `readFile` paths are repo-relative (tests run from repo root)
- **Existing coverage of change area**: no test currently covers `src/defaults/prompts/spec.md`
  (confirmed: no file in `tests/defaults/` references `spec.md`)

## Code References

- `src/defaults/prompts/spec.md:1` — `# Write Cycle Spec` header; file currently 113 lines
- `src/defaults/prompts/spec.md:7-18` — `## Discover Cycle Context First` section
- `src/defaults/prompts/spec.md:20-70` — `## Write the Spec` section with markdown template
- `src/defaults/prompts/spec.md:72-95` — `## Cycle Sizing` section
- `src/defaults/prompts/spec.md:97-107` — `## UI & Design Standards` section
- `src/defaults/prompts/spec.md:109-113` — `## Output` section (final section)
- `.cycle/prompts/spec.md:1-113` — byte-identical to source; no divergence
- `tests/defaults/plan-prompt-spec-traceability.test.ts:1-72` — reference implementation for
  structural + parity pinning test pattern
- `tests/defaults/review-prompt-doc-claim-pass.test.ts:1-43` — second reference for same pattern

## Open Questions

- **Where in `spec.md` should the clause land?** The issue says "prominently placed" but does not
  specify before or after `## Write the Spec`. Planner should decide: immediately before
  `## Write the Spec` (so the agent reads it before drafting), or as a named section after
  `## Discover Cycle Context First` (so it runs during the discovery phase).
- **How many structural assertions should the pinning test include?** The plan test has 6
  assertions (3 structural + 3 cross-file). The review test has 5. Planner should decide the
  minimum set that meaningfully pins the three-step requirement.
- **`npm run sync-defaults` vs direct copy**: since `.cycle/prompts/spec.md` is not divergent,
  either approach works. Planner should specify which to use in the build step.
```
