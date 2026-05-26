# SPEC — Cycle 0253: Replace Hand-Rolled Frontmatter Parser with `yaml` Module

## Objective

`src/engine/frontmatter.ts` currently parses YAML frontmatter using a hand-rolled regex and a `parseScalar` function that splits array values on commas with no escape handling. This causes silent data corruption whenever issue titles, descriptions, or other string fields contain commas, quotes, or multi-line values — corrupting fields that propagate into triage output, queue rows, commit messages, and artifact directory names. This cycle replaces the fragile custom parser with `yaml.parse` and updates `serializeFrontmatter` to use `yaml.stringify`, ensuring lossless round-trips. The `yaml` package is already a declared runtime dependency; no new packages are required.

## Source Issue

`mentor-frontmatter-parser-use-yaml` — "Replace hand-rolled frontmatter regex parser with yaml module to fix comma/quote/multiline bugs"

## Scope

### In Scope
- Replace `parseScalar` and the regex-based field loop in `parseFrontmatter` with a single `yaml.parse` call
- Replace `serializeValue` / `serializeFrontmatter` (the hand-rolled serializer) with `yaml.stringify`
- Add tests covering comma-in-title, quoted-string, and multi-line frontmatter values

### Out of Scope
- Changes to callers of `parseFrontmatter` / `serializeFrontmatter` / `mutateFrontmatter` — the public API signatures must not change
- Migration or backfill of existing issue files on disk
- Changes to any other engine module

## Requirements

- `parseFrontmatter` must delegate YAML parsing to `yaml.parse` from the `yaml` package; the regex/`parseScalar` path must be removed
- `serializeFrontmatter` must produce output that round-trips through `parseFrontmatter` without data loss
- The `Frontmatter` type (`Record<string, FrontmatterValue>`) and the `ParsedFrontmatter`, `mutateFrontmatter` signatures must remain unchanged
- `depends_on: [id-a, id-b]` (inline YAML array) must continue to parse as a `string[]`
- A title value containing commas, double-quotes, or embedded newlines must parse as a single `string`, not an array or corrupted value
- All existing frontmatter tests must continue to pass

## Acceptance Criteria

- [ ] `parseFrontmatter` uses `yaml.parse` for the frontmatter block; `parseScalar` and the line-splitting loop are gone
- [ ] `serializeFrontmatter` uses `yaml.stringify` to produce the frontmatter block
- [ ] A title `"Fix login, cookie, and session"` parses as the string `Fix login, cookie, and session`, not an array
- [ ] A title containing a double-quote character parses as a string with the quote preserved
- [ ] A multi-line frontmatter value (block scalar or quoted) parses as a single string
- [ ] `depends_on: [id-a, id-b]` parses as `["id-a", "id-b"]`
- [ ] `serializeFrontmatter` output round-trips: `parseFrontmatter(serializeFrontmatter(fm, body)).fm` deep-equals `fm`
- [ ] All existing frontmatter tests pass
- [ ] New tests cover comma, quote, and multi-line cases
- [ ] Full test suite passes with no regressions (`npm test`)
- [ ] Coverage floors not decreased (`npm run test:coverage`)

## Testing Strategy

- Framework: Node built-in test runner (`node:test`) matching existing test conventions in `tests/engine/`
- Happy path: existing key/value, array, and numeric field tests must continue to pass
- Regression cases: title with commas, title with double-quotes, multi-line value via block scalar
- Round-trip test: serialize then parse a `Frontmatter` object and assert deep equality
- `mutateFrontmatter` integration: write a temp file, mutate it, read back and assert correctness

## Documentation Updates

- **CLAUDE.md / AGENTS.md**: No command or convention changes
- **README.md**: No user-facing change; this is an internal parser fix with no observable CLI behavior change

## Dependencies

- `yaml` package already present in `package.json` `dependencies` — no install required
- `tests/engine/frontmatter.test.ts` (or equivalent) must exist or be created in this cycle
