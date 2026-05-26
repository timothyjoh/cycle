# Implementation Plan: Cycle 0253

## Overview

Replace the hand-rolled regex/`parseScalar` frontmatter parser in `src/engine/frontmatter.ts` with `yaml.parse` and `yaml.stringify` from the already-installed `yaml` package. Eliminates silent data corruption when issue titles contain commas, quotes, or multi-line values.

## Current State (from Research)

`frontmatter.ts` is 72 lines. The `FM_RE` regex extracts the raw block between `---` fences; `parseScalar` splits arrays on commas (no escape handling) and strips quotes naively. `serializeFrontmatter` is hand-rolled with `needsQuote`/`serializeValue`. `yaml` v2.9.0 is already declared in `dependencies` and imported in `workflow.ts` as `import YAML from "yaml"`. `mutateFrontmatter` is not in scope.

Nine existing tests cover scalar parse, array parse, empty array, round-trip byte equality, colon-quoting, missing frontmatter error, `mutateFrontmatter` add-key, `mutateFrontmatter` idempotency, array serialization, empty body, and all-digit string preservation.

## Open Questions Resolved

**Q1 (round-trip byte equality):** `yaml.stringify` for the round-trip test input (`id: X`, `title: "a: b"`, `attempt: 0`) produces byte-identical output to the hand-rolled serializer. The existing `out === body` assertion passes unchanged.

**Q2 (numeric string preservation):** `yaml.parse('origin_cycle_id: "0042"\n')` returns string `"0042"`. `yaml.stringify({origin_cycle_id: "0042"})` preserves the quotes. Both the serialize and re-parse assertions in that test pass unchanged.

**Q3 (key name constraint):** `yaml.parse` accepts any valid YAML key, not just `\w+`. Benign — all real issue frontmatter keys are alphanumeric/underscore.

**Q4 (key ordering):** `yaml.parse` preserves insertion order for plain objects in yaml v2. The `Object.keys(fm)` assertion passes.

**Q5 (serializeFrontmatter format):** `"---\n" + YAML.stringify(fm) + "---\n" + bodyAfter`. `yaml.stringify` produces a trailing `\n` so the `\n` before `---` is accounted for. Verified via `node` REPL.

**Two test assertions need updating (format change, not behavior change):**
- `"serialize array values"`: `yaml.stringify` produces block notation (`depends_on:\n  - a\n  - b\n`) not inline (`[a, b]`). Test regex must be updated to match yaml's output.
- `"mutateFrontmatter adds new keys"`: `yaml.stringify` produces `failed_at: 2026-05-13T00:00:00Z` (unquoted — YAML 1.2 has no timestamp type so ISO-8601 strings are plain scalars that round-trip correctly as strings). Test regex must drop the surrounding quotes.

## Desired End State

`src/engine/frontmatter.ts` imports `yaml`, has no `parseScalar`, `needsQuote`, or `serializeValue`, and `parseFrontmatter`/`serializeFrontmatter` delegate entirely to `YAML.parse`/`YAML.stringify`. All 9 existing tests pass (2 assertions updated for format). 4 new tests cover comma, quote, multi-line, and round-trip cases. `npm test` and `npm run test:coverage` pass with no regressions.

## What We're NOT Doing

- Changing `mutateFrontmatter` — not in scope per SPEC
- Changing callers (`triage.ts`, `cli.ts`, `cleanup.ts`, `issue-lifecycle.ts`, `reflection.ts`, `blocked.ts`)
- Changing the `Frontmatter`, `FrontmatterValue`, or `ParsedFrontmatter` types
- Migrating existing issue files on disk
- Adding a per-file coverage floor for `frontmatter.ts` to `scripts/coverage-gate.mjs` (no floor exists today; aggregate thresholds apply)
- Adding `yaml` to dependencies (already present)
- Changing any other engine module

## Implementation Approach

Keep `FM_RE` for block extraction — it correctly isolates the YAML body between fences and computes `bodyAfter`. Replace only the internal parsing and serialization helpers with `yaml`. Type-assert the `yaml.parse` result as `Frontmatter`; no runtime coercion needed since all issue frontmatter fields are string/number/string[].

---

## Task 1: Rewrite `src/engine/frontmatter.ts`

### Overview

Add `yaml` import. Remove `parseScalar`, `needsQuote`, `serializeValue`. Rewrite `parseFrontmatter` to call `YAML.parse(m[1])`. Rewrite `serializeFrontmatter` to call `YAML.stringify(fm)` wrapped with fences. Keep `FM_RE` and `mutateFrontmatter` verbatim.

### Changes Required

**File**: `src/engine/frontmatter.ts`

Replace the entire file content (72 lines) with the following (~30 lines):

```typescript
import { readFile, writeFile, rename } from "node:fs/promises";
import YAML from "yaml";

export type FrontmatterValue = string | number | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export type ParsedFrontmatter = { fm: Frontmatter; bodyAfter: string };

const FM_RE = /^---\n([\s\S]*?)\n---\n/;

export function parseFrontmatter(body: string): ParsedFrontmatter {
  const m = body.match(FM_RE);
  if (!m) throw new Error("no frontmatter");
  const fm = YAML.parse(m[1]) as Frontmatter;
  const bodyAfter = body.slice(m[0].length);
  return { fm, bodyAfter };
}

export function serializeFrontmatter(fm: Frontmatter, bodyAfter: string): string {
  return "---\n" + YAML.stringify(fm) + "---\n" + bodyAfter;
}

export async function mutateFrontmatter(
  path: string,
  patch: (fm: Frontmatter) => Frontmatter,
): Promise<void> {
  const body = await readFile(path, "utf8");
  const { fm, bodyAfter } = parseFrontmatter(body);
  const next = patch({ ...fm });
  const out = serializeFrontmatter(next, bodyAfter);
  const tmp = path + ".tmp";
  await writeFile(tmp, out, "utf8");
  await rename(tmp, path);
}
```

### Success Criteria

- [ ] `tsc --noEmit` passes (no type errors)
- [ ] `npm run build` succeeds
- [ ] `parseScalar`, `needsQuote`, `serializeValue` are gone from the file
- [ ] `FM_RE` and `mutateFrontmatter` are byte-identical to the original

---

## Task 2: Update Two Existing Test Assertions

### Overview

Two existing test assertions check the serialized format produced by the hand-rolled serializer. `yaml.stringify` produces different but semantically equivalent formatting. Update the assertions to match yaml's output.

### Changes Required

**File**: `tests/engine/frontmatter.test.ts`

**Change 1** — `"serialize array values"` test (line 86):

```typescript
// Before
assert.match(out, /depends_on: \[a, b\]/);

// After — yaml.stringify uses block notation for arrays
assert.match(out, /depends_on:\n  - a\n  - b/);
```

**Change 2** — `"mutateFrontmatter adds new keys preserving existing order"` test (line 61):

```typescript
// Before
assert.match(out, /id: X\ntitle: simple\nfailed_at: "2026-05-13T00:00:00Z"\nfailed_attempts: 3/);

// After — yaml 1.2 does not wrap ISO-8601 strings in quotes (they round-trip as strings)
assert.match(out, /id: X\ntitle: simple\nfailed_at: 2026-05-13T00:00:00Z\nfailed_attempts: 3/);
```

### Success Criteria

- [ ] Both assertions compile
- [ ] `"serialize array values"` passes: `yaml.stringify` block-notation output matches the updated regex
- [ ] `"mutateFrontmatter adds new keys"` passes: unquoted ISO timestamp matches updated regex
- [ ] All 9 existing tests pass (`npm test`)

---

## Task 3: Add New Tests for Corruption Edge Cases

### Overview

Four new tests cover the bug cases from the issue report plus the SPEC round-trip requirement.

### Changes Required

**File**: `tests/engine/frontmatter.test.ts` — append after the final existing test

```typescript
test("title with comma parses as single string, not array", () => {
  const body = `---\nid: X\ntitle: "Fix login, cookie, and session"\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.equal(fm.title, "Fix login, cookie, and session");
  assert.equal(typeof fm.title, "string");
});

test("title with double-quote character preserved", () => {
  const body = `---\nid: X\ntitle: 'He said "hello"'\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.equal(fm.title, 'He said "hello"');
});

test("multi-line value via block scalar parses as single string", () => {
  const body = `---\nid: X\ntitle: |\n  line one\n  line two\n---\n\nbody\n`;
  const { fm } = parseFrontmatter(body);
  assert.equal(typeof fm.title, "string");
  assert.match(fm.title as string, /line one/);
  assert.match(fm.title as string, /line two/);
});

test("serializeFrontmatter round-trip: parse(serialize(fm)) deep-equals fm", () => {
  const fm: Frontmatter = {
    id: "0099",
    title: "Fix login, cookie, and session",
    attempt: 2,
    depends_on: ["id-a", "id-b"],
    origin_cycle_id: "0042",
  };
  const serialized = serializeFrontmatter(fm, "\nbody\n");
  const { fm: reparsed } = parseFrontmatter(serialized);
  assert.deepEqual(reparsed, fm);
});
```

### Success Criteria

- [ ] Four new tests exist in `tests/engine/frontmatter.test.ts`
- [ ] `"title with comma"` passes
- [ ] `"title with double-quote"` passes
- [ ] `"multi-line block scalar"` passes
- [ ] `"round-trip deep-equals"` passes: comma title, numeric string, array all survive serialize→parse

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] parseFrontmatter uses yaml.parse for the frontmatter block; parseScalar and the line-splitting loop are gone` | Task 1 | `YAML.parse(m[1])` replaces loop; `parseScalar` removed |
| `[ ] serializeFrontmatter uses yaml.stringify to produce the frontmatter block` | Task 1 | `"---\n" + YAML.stringify(fm) + "---\n" + bodyAfter` |
| `[ ] A title "Fix login, cookie, and session" parses as the string Fix login, cookie, and session, not an array` | Task 3 | New test: `"title with comma parses as single string, not array"` |
| `[ ] A title containing a double-quote character parses as a string with the quote preserved` | Task 3 | New test: `"title with double-quote character preserved"` |
| `[ ] A multi-line frontmatter value (block scalar or quoted) parses as a single string` | Task 3 | New test: `"multi-line value via block scalar parses as single string"` |
| `[ ] depends_on: [id-a, id-b] parses as ["id-a", "id-b"]` | Task 3 | Covered by round-trip test `depends_on: ["id-a", "id-b"]` in `fm` object |
| `[ ] serializeFrontmatter output round-trips: parseFrontmatter(serializeFrontmatter(fm, body)).fm deep-equals fm` | Task 3 | New test: `"serializeFrontmatter round-trip: parse(serialize(fm)) deep-equals fm"` |
| `[ ] All existing frontmatter tests pass` | Task 2 | Two assertions updated for yaml format; all 9 tests pass |
| `[ ] New tests cover comma, quote, and multi-line cases` | Task 3 | Three dedicated tests added |
| `[ ] Full test suite passes with no regressions (npm test)` | Tasks 1–3 | Verified after all changes |
| `[ ] Coverage floors not decreased (npm run test:coverage)` | Tasks 1–3 | No per-file floor for `frontmatter.ts`; aggregate thresholds apply |

---

## Testing Strategy

### Unit Tests

All tests in `tests/engine/frontmatter.test.ts` using `node:test` and `node:assert`.

Existing tests (9): All pass; two assertions updated to match `yaml.stringify` format (array block notation; unquoted ISO-8601 timestamp).

New tests (4):
- Comma in title: input uses YAML double-quoted string; asserts `typeof === "string"` and value equality
- Double-quote in title: input uses YAML single-quoted string; asserts value equality
- Multi-line block scalar: input uses YAML `|` block literal; asserts `typeof === "string"` and substring matches
- Round-trip: constructs a `Frontmatter` object with all value types (string, number, string[], zero-padded string), serializes, re-parses, `deepEqual` asserts

### Mocking Strategy

None. All tests use real `parseFrontmatter`/`serializeFrontmatter` functions. `mutateFrontmatter` tests use real temp directories (per CLAUDE.md: `node:fs/promises` ESM exports are non-configurable; real filesystem is required).

### Integration / E2E

`mutateFrontmatter` tests (existing, unchanged) exercise the full read→parse→patch→serialize→write→rename path with a real temp file.

## Risk Assessment

- **`yaml.stringify` ISO-8601 timestamp unquoted**: `yaml.parse` in YAML 1.2 mode returns the unquoted value as a `string`, not a `Date`. Verified via REPL. Callers receive a string as before. Risk: low.
- **`yaml.stringify` block array notation breaks callers**: Callers pass the serialized frontmatter through `parseFrontmatter` (not raw regex). `yaml.parse` handles both inline `[a, b]` and block `- a\n  - b` notation. No caller does raw string matching on serialized array output. Risk: low.
- **`yaml.parse` returns non-`FrontmatterValue` types for unexpected frontmatter fields** (e.g., boolean `true`): All issue files in practice use only string/number/string[] fields. Type-assertion `as Frontmatter` is safe. Risk: negligible; no existing issue file has boolean or null fields.
- **`FM_RE` unchanged — edge case where frontmatter block contains literal `\n---\n`**: Pre-existing limitation in the original code; not introduced by this change. Out of scope.
