# Research: Cycle 0253

## Cycle Context

Cycle 0253 replaces the hand-rolled regex/`parseScalar` frontmatter parser in `src/engine/frontmatter.ts` with `yaml.parse` and `yaml.stringify` from the `yaml` package (already a declared runtime dependency). The current parser silently corrupts titles containing commas, quotes, or multi-line values. The public API signatures — `parseFrontmatter`, `serializeFrontmatter`, `mutateFrontmatter`, `Frontmatter`, `FrontmatterValue`, `ParsedFrontmatter` — must not change. Callers are out of scope.

---

## Current Codebase State

### `src/engine/frontmatter.ts` (the only file under change)

Full file: 72 lines. Exports:
- `FrontmatterValue = string | number | string[]` — `frontmatter.ts:3`
- `Frontmatter = Record<string, FrontmatterValue>` — `frontmatter.ts:4`
- `ParsedFrontmatter = { fm: Frontmatter; bodyAfter: string }` — `frontmatter.ts:6`
- `parseFrontmatter(body: string): ParsedFrontmatter` — `frontmatter.ts:21`
- `serializeFrontmatter(fm: Frontmatter, bodyAfter: string): string` — `frontmatter.ts:51`
- `mutateFrontmatter(path: string, patch: (fm: Frontmatter) => Frontmatter): Promise<void>` — `frontmatter.ts:60`

Internal (to be removed):
- `FM_RE = /^---\n([\s\S]*?)\n---\n/` — `frontmatter.ts:8` — regex that isolates the frontmatter block
- `parseScalar(raw: string): FrontmatterValue` — `frontmatter.ts:10` — splits arrays on commas, strips quotes, parses integers
- `needsQuote(s: string): boolean` — `frontmatter.ts:34` — decides whether a string value needs quoting
- `serializeValue(v: FrontmatterValue): string` — `frontmatter.ts:42` — hand-rolls quoting and array notation

`parseFrontmatter` flow: match `FM_RE` → split capture group on `\n` → per-line regex `^(\w+):\s*(.*)$` → call `parseScalar` on the value side.

`serializeFrontmatter` flow: `["---"]` → one `${k}: ${serializeValue(v)}` line per key → `"---"` → join with `\n` → append `bodyAfter`.

`mutateFrontmatter` flow: `readFile` → `parseFrontmatter` → `patch({...fm})` → `serializeFrontmatter` → write to `.tmp`, `rename` to atomically replace.

### `yaml` Package (already installed)

Declared in `dependencies` at `^2.6.0` — `package.json:32`. Already imported as a default import in `src/engine/workflow.ts:3` with `import YAML from "yaml"`. Usage there: `YAML.parse(body)` at `workflow.ts:54` to parse the entire `workflows.yml` as a plain object. The package exposes `YAML.parse(str)` and `YAML.stringify(obj)` on its default export.

---

## Relevant Patterns to Follow

### `yaml` Import Style (from existing usage)

`workflow.ts` uses a default import: `import YAML from "yaml"` — `workflow.ts:3`. The call sites use `YAML.parse(body)` without options. The same pattern should be followed in `frontmatter.ts`.

### Frontmatter Block Extraction Pattern

`FM_RE = /^---\n([\s\S]*?)\n---\n/` captures the raw YAML block between fences — `frontmatter.ts:8`. The match object `m[0]` is the full matched string (including fences and trailing newline); `m[1]` is the YAML body text alone. `bodyAfter = body.slice(m[0].length)` — `frontmatter.ts:30`. This extraction pattern (match regex, slice remainder) should be preserved; only the parsing of `m[1]` changes.

### Atomic File Write (mutateFrontmatter)

Write to `path + ".tmp"`, then `rename(tmp, path)` — `frontmatter.ts:68–70`. This is an existing safety pattern; `mutateFrontmatter` is not in scope for change.

### Test File Conventions

- Location: `tests/engine/<module>.test.ts` — all engine module tests follow this layout.
- Import: direct `../../src/engine/frontmatter.ts` — `frontmatter.test.ts:10`.
- Framework: `node:test` with `import { test } from "node:test"` and `import { strict as assert } from "node:assert"` — `frontmatter.test.ts:1–2`.
- Async tests using real temp dirs: `mkdtemp(join(tmpdir(), "cycle-..."))` with `finally { rm(root, { recursive: true, force: true }) }` — `frontmatter.test.ts:54–65`.
- No mocking of `node:fs/promises` (per CLAUDE.md: ESM module properties are non-configurable; use real filesystem instead).

### `FrontmatterValue` Type Constraint

The return type of `parseFrontmatter` and what callers assign from it is `Record<string, FrontmatterValue>` where `FrontmatterValue = string | number | string[]`. `yaml.parse` returns `unknown`/`any`-typed object values; the implementation must coerce or assert values to `FrontmatterValue`. The `depends_on` field must parse as `string[]` (YAML inline array `[a, b, c]`); numeric strings like `"0042"` must remain strings not numbers.

---

## Dependencies & Integration Points

### Callers of `parseFrontmatter`

- `src/engine/triage.ts:346` — reads issue body, calls `parseFrontmatter`, uses `fm` for queue row construction and `serializeFrontmatter` at line 380 and 618.
- `src/cli.ts:310,350,474` — parses issue files for status display, cleanup, and in-flight cycle display.
- `src/cli/cleanup.ts:44` — parses branch issue files for cleanup command.
- `src/engine/issue-lifecycle.ts:42` — parses issue body to retrieve `fm` and `bodyAfter` for re-serialization.

### Callers of `serializeFrontmatter`

- `src/engine/triage.ts:380,618` — serializes queue row and todo issue content.
- `src/engine/issue-lifecycle.ts:56` — serializes mutated frontmatter back to file.
- `src/engine/reflection.ts:180,395` — serializes reflection issue content.

### Callers of `mutateFrontmatter`

- `src/engine/triage.ts:243,679,692` — mutates `triage_attempts`, `triaged_at`, and failure stamps.
- `src/engine/issue-lifecycle.ts:21` — mutates lifecycle timestamps.
- `src/engine/blocked.ts:42` — mutates `blocked_reason`.

None of these callers are in scope; their imports and usage signatures must remain valid after the change.

---

## Test Infrastructure

- **Framework**: `node:test` (Node built-in). No transpile step — tests run directly with `--experimental-strip-types`.
- **Runner**: `node --test --experimental-strip-types --test-reporter=spec` via `npm test` — `package.json:10`.
- **Coverage**: `npm run test:coverage` produces `.cycle/coverage.lcov`; `scripts/coverage-gate.mjs` enforces per-file floors.
- **`src/engine/frontmatter.ts` coverage floor**: Not listed in `FLOORS` table — `scripts/coverage-gate.mjs:12–31`. No explicit per-file floor; aggregate thresholds (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) apply.
- **Existing test file**: `tests/engine/frontmatter.test.ts` — 9 tests covering: scalar/quoted/numeric parse, array parse, empty array, round-trip, colon-quoting, missing frontmatter error, `mutateFrontmatter` add-key, `mutateFrontmatter` idempotency, array serialization, empty body, all-digit string round-trip.
- **Key existing test that constrains implementation**: `"all-digit string round-trips as string (preserves zero-padding)"` — `frontmatter.test.ts:94–99` — `origin_cycle_id: "0042"` must serialize and re-parse as the string `"0042"`, not the number `42`. This means `yaml.parse` of the frontmatter block must not auto-coerce quoted numeric strings to numbers.
- **Key existing test that constrains serializer**: `"round-trip parse -> serialize preserves body and key order"` — `frontmatter.test.ts:33–40` — asserts that `out === body` byte-for-byte. `yaml.stringify` output format must match the hand-rolled format exactly for the test cases exercised, or the test must be updated to accept `yaml.stringify` output.

---

## Code References

- `src/engine/frontmatter.ts:1` — only imports from `node:fs/promises`; will need `yaml` import added
- `src/engine/frontmatter.ts:3–6` — type exports; must remain identical
- `src/engine/frontmatter.ts:8` — `FM_RE`; the block-extraction regex; planner must decide whether to keep it or replace with a `yaml`-document-level parse
- `src/engine/frontmatter.ts:10–19` — `parseScalar`; target for removal
- `src/engine/frontmatter.ts:21–32` — `parseFrontmatter`; primary rewrite target
- `src/engine/frontmatter.ts:34–49` — `needsQuote` + `serializeValue`; target for removal
- `src/engine/frontmatter.ts:51–58` — `serializeFrontmatter`; secondary rewrite target
- `src/engine/frontmatter.ts:60–71` — `mutateFrontmatter`; not in scope, must remain unchanged
- `src/engine/workflow.ts:3` — `import YAML from "yaml"` — canonical import style for the `yaml` package in this codebase
- `tests/engine/frontmatter.test.ts:33–40` — round-trip byte-equality test; may break if `yaml.stringify` produces different whitespace/quoting than the hand-rolled serializer
- `tests/engine/frontmatter.test.ts:94–99` — all-digit string preservation test; constrains how numeric-looking values must be handled
- `scripts/coverage-gate.mjs:12–31` — `FLOORS` table; `frontmatter.ts` absent, so no per-file floor to add unless planner decides to register one

---

## Open Questions

1. **Round-trip byte equality**: The existing test at `frontmatter.test.ts:33–40` asserts `out === body` where `body = '---\nid: X\ntitle: "a: b"\nattempt: 0\n---\n\nbody bytes preserved\n'`. If `yaml.stringify` produces different quoting or spacing (e.g. `title: 'a: b'` or trailing spaces), this assertion fails. The planner must decide: update the test to accept `yaml.stringify` output, or apply `yaml.stringify` options to force the exact format needed.

2. **Numeric string preservation**: `yaml.parse('origin_cycle_id: "0042"\n')` returns `{ origin_cycle_id: '0042' }` (quoted in YAML = string). But `yaml.parse('attempt: 3\n')` returns `{ attempt: 3 }` (number). `FrontmatterValue` includes `number`, so this is valid — but the planner must confirm how `yaml.stringify` re-serializes a `number` value (e.g. does it produce `attempt: 3` or `attempt: "3"`?) to ensure the `mutateFrontmatter` idempotency test still passes.

3. **Key name constraint in current parser**: `parseFrontmatter` at line 27 uses `/^(\w+):\s*(.*)$/` which restricts keys to `\w+` (word chars, no hyphens). `yaml.parse` does not impose this restriction. This is a behavioral difference but likely benign since all known issue frontmatter keys are alphanumeric-plus-underscore. The planner should confirm this is acceptable.

4. **`yaml.stringify` key ordering**: `yaml.stringify` may not preserve insertion order of object keys in all versions. The test at `frontmatter.test.ts:39` asserts `deepEqual(Object.keys(fm), ["id", "title", "attempt"])`. This tests the parsed output from `parseFrontmatter`, not from `yaml.stringify` directly, so it likely passes if `yaml.parse` preserves key order (it does for plain objects in yaml v2). Planner should verify this assumption.

5. **`serializeFrontmatter` format with `yaml.stringify`**: `yaml.stringify` wraps the entire object in YAML document notation. The planner must determine whether to call `yaml.stringify` on the full `fm` object and wrap it with `---\n...\n---\n`, or use lower-level `yaml` APIs to produce individual field lines. The expected output format (e.g., `id: X\ntitle: simple\n` without document markers) must match what callers expect after deserialization.
