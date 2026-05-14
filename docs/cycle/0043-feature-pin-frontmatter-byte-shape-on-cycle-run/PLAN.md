```markdown
# Implementation Plan: Cycle 0043

## Overview
Add a single end-to-end test that spawns `cycle run "<text>" --dry-run`
against a temp repo and pins the resulting raw-issue frontmatter byte
shape — including `priority: 3` — so future divergence between the
`cycle drop` and `cycle run "<text>"` call sites of
`materializeFreeformIssue` fails CI instead of silently shipping.

## Current State (from Research)
- `cycle run "<text>"` calls `materializeFreeformIssue(args.text, cwd)`
  with no `priority` arg → relies on default `3`
  (`src/cli.ts:77-79`).
- `cycle drop` calls `materializeFreeformIssue(args.text, cwd, new
  Date(), args.priority)` (`src/cli.ts:68-72`).
- Shared writer emits a fixed 6-field frontmatter block in order:
  `id`, `source: text`, `title`, `added_at`, `triage_attempts: 0`,
  `priority: <n>` (`src/issue/materialize.ts:15-27`).
- `freeformId(text, now)` → `txt-YYYYMMDD-HHMMSS-<slug>`
  (`src/issue/id.ts:10-18`). Slug from text, `[a-z0-9-]`, capped 40.
- Existing e2e harness at `tests/cli/multi-loop.test.ts` uses
  `mkdtemp` + `ensureDist()` + `spawnSync("node", [distPath, ...])` +
  `rm(root, ...)` cleanup. The `'drop' materializes an issue to raw/`
  test (lines 123-147) is the structural sibling.
- Byte-exact frontmatter pin already exists at
  `tests/issue/materialize.test.ts:21-33` —
  `body.startsWith(expectedFrontmatter)`. Same technique applies here.
- `cycle run --dry-run` DOES create `.cycle/log.jsonl` (engine.start
  emitted at `src/cli.ts:74-75` before the dry-run short-circuit).
  Test must NOT assert log absence — that's a `drop`-only invariant.

## Desired End State
- `tests/cli/multi-loop.test.ts` contains a new test, sibling to the
  `drop` test, that:
  - Spawns `node dist/cycle.js run "<text>" --dry-run` in a temp repo.
  - Reads the single `*.md` file in `docs/cycle/issues/raw/`.
  - Asserts the frontmatter starts with the byte-exact 6-field block,
    including `priority: 3`.
  - Asserts the body contains the text (mirrors the drop assertion).
- `npm test` → all tests pass (≥343 tests).
- `npm run typecheck` → clean.
- `npm run test:coverage` → line ≥ 95%, branch ≥ 75%, func ≥ 90%, no
  per-file regressions.

## What We're NOT Doing
- NOT refactoring `cli.ts` to collapse `drop` and `run "<text>"` into a
  shared helper (Option B in the source issue is explicitly
  out-of-scope per SPEC).
- NOT adding a `--priority` flag to `cycle run`.
- NOT changing the default `priority: 3`, any frontmatter field name,
  the field order, or the writer signature.
- NOT touching triage or any production code path. Test-only cycle.
- NOT adding a `--now`-style injection to make the id deterministic
  across the spawn boundary — discovery via `readdir` is sufficient.
- NOT adding a separate test file. The new test belongs next to the
  `drop` test for lockstep maintenance.

## Implementation Approach
One vertical slice, one new test. The two open questions in
RESEARCH.md resolve as follows:

1. **Discovering the written raw file**: `readdir(raw/)` and require
   exactly one `*.md` entry. Cleanest, no clock-injection plumbing,
   matches the temp-repo isolation guarantee (only the spawned `run`
   created files there).
2. **Assertion fidelity**: byte-exact frontmatter prefix match,
   identical technique to `tests/issue/materialize.test.ts:21-33`.
   This pins ALL six fields in their documented order (RFC-001 §"Raw
   drop") — strictly stronger than a single `priority: 3` regex —
   without meaningfully increasing maintenance cost (the writer's
   shape is already pinned at the unit level by the same string).
3. **Title-quote escaping**: pick `"park this too"` (no `"`
   characters) so the title line is literally `title: "park this
   too"` with no escape modeling needed.
4. **Log absence**: do NOT assert `.cycle/log.jsonl` is missing; the
   `run` path emits `engine.start` before the dry-run short-circuit.

The test must compute the expected `id` at assertion time. The
spawned process picks `now = new Date()` itself, so the id's
timestamp is unknown to the test. Strategy: derive expected id from
the actual raw filename (strip `.md`), then build
`expectedFrontmatter` from that id plus a regex'd `added_at` line.
Concretely we use a two-part assertion:
- `assert.match(filename, /^txt-\d{8}-\d{6}-park-this-too\.md$/)` to
  pin the id format and slug.
- `assert.ok(body.startsWith(expectedFrontmatter))` where
  `expectedFrontmatter` is built from the actual `id` we just
  matched, with `added_at` replaced by a deterministic-shape check
  via a separate `assert.match(body, /^added_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m)`.

This is the right balance: byte-exact pinning everywhere except the
two fields that legitimately depend on wall-clock time.

---

## Task 1: Add e2e test pinning `cycle run "<text>" --dry-run` frontmatter byte-shape

### Overview
Add a new `node:test` case to `tests/cli/multi-loop.test.ts`,
positioned immediately after the existing `'drop' materializes ...`
test at line 147, that spawns `cycle run "<text>" --dry-run`, reads
back the single raw file, and pins the frontmatter byte shape
including `priority: 3`.

### Changes Required
**File**: `tests/cli/multi-loop.test.ts`

**Changes**: Append a new test after line 147. Sketch:

```ts
import { readdir } from "node:fs/promises";
// (readdir is not yet imported — add it to the existing line 3 import)

test("'run \"<text>\" --dry-run' pins raw frontmatter byte-shape (priority: 3 default)", async () => {
  const root = await mkdtemp(join(tmpdir(), "cycle-test-"));
  try {
    const distPath = await ensureDist();

    const r = spawnSync(
      "node",
      [distPath, "run", "park this too", "--dry-run"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(r.status, 0, `cycle run exit: ${r.status}\nstderr: ${r.stderr}`);

    const rawDir = join(root, "docs/cycle/issues/raw");
    const entries = (await readdir(rawDir)).filter((f) => f.endsWith(".md"));
    assert.equal(entries.length, 1, `expected exactly one raw .md, got: ${entries.join(", ")}`);

    const filename = entries[0];
    assert.match(filename, /^txt-\d{8}-\d{6}-park-this-too\.md$/);
    const id = filename.slice(0, -3); // strip ".md"

    const body = await readFile(join(rawDir, filename), "utf8");

    // added_at is wall-clock — pin its shape, not its value.
    assert.match(
      body,
      /^added_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/m,
      "added_at must be ISO-8601 with milliseconds",
    );

    // Lock the full six-field frontmatter block in documented order
    // (RFC-001 §"Raw drop"), substituting the actual id and the
    // observed added_at line. Critically pins `priority: 3`.
    const addedAtMatch = body.match(/^added_at: .*$/m);
    assert.ok(addedAtMatch, "added_at line missing");
    const expectedFrontmatter =
      "---\n" +
      `id: ${id}\n` +
      "source: text\n" +
      'title: "park this too"\n' +
      `${addedAtMatch[0]}\n` +
      "triage_attempts: 0\n" +
      "priority: 3\n" +
      "---\n";
    assert.ok(
      body.startsWith(expectedFrontmatter),
      `frontmatter mismatch:\n${body}`,
    );

    // Body preserved with trailing newline (mirrors materialize unit test).
    assert.match(body, /\npark this too\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

Also extend the existing `node:fs/promises` import on line 3 to
include `readdir`:

```ts
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod, appendFile } from "node:fs/promises";
```

### Success Criteria
- [ ] `npm run build` clean (no esbuild errors — test files don't go
      through the bundle but `pretest` runs the build).
- [ ] `npm run typecheck` clean — no warnings.
- [ ] `npm test` passes; new test is in the output and passes.
- [ ] New test fails (verifying it pins what it claims) when:
      - default `priority: 3` is changed in `materializeFreeformIssue`
        (e.g. to `5`), OR
      - the `run` path stops calling `materializeFreeformIssue` (e.g.
        someone inlines a different writer), OR
      - any of the six frontmatter fields is renamed / reordered /
        dropped.
- [ ] `npm run test:coverage` passes thresholds (line ≥ 95%, branch ≥
      75%, func ≥ 90%); no per-file regression. New test exercises
      `materializeFreeformIssue` and the `run` text-positional branch
      via dist, so coverage should be flat-or-up.
- [ ] Test cleans up `mkdtemp` root via `finally { rm(...) }`.

---

## Testing Strategy

### Unit Tests
- None added. `materializeFreeformIssue` is already covered at the
  unit level by `tests/issue/materialize.test.ts` (frontmatter prefix
  + explicit-priority cases). This cycle is specifically about
  pinning the integration of that writer with the `cli run "<text>"`
  call site, which only e2e can verify.

### Integration / E2E Tests
- One new test: `'run "<text>" --dry-run' pins raw frontmatter
  byte-shape (priority: 3 default)` (described in Task 1).
- Mocking strategy: NONE. Real spawn, real temp repo, real on-disk
  file read. Matches existing `multi-loop.test.ts` discipline.

## Risk Assessment
- **Risk: timestamp races.** The id encodes seconds, and `mkdtemp` +
  `spawnSync` complete in well under one second, so two consecutive
  test invocations within the same temp root could collide — but each
  test gets its own `mkdtemp` root, so collision is impossible.
  *Mitigation: confirmed by the harness pattern; no action needed.*
- **Risk: existing `drop` test or seed helpers leave files in the
  temp root.** Each test creates its own `mkdtemp` and only the
  spawned process writes to it. *Mitigation: verified by reading
  `tests/cli/multi-loop.test.ts:38-58, 60-121, 123-147` — no
  cross-test state.*
- **Risk: `readdir` returns hidden files / non-`.md` artifacts that
  inflate count.** Filtered to `.md` extension; `materializeFreeformIssue`
  only writes `.md`, and no other code in the dry-run path touches
  `raw/`. *Mitigation: explicit `.filter(f => f.endsWith(".md"))`.*
- **Risk: `added_at` regex over-permissive and lets a bad timestamp
  slip through.** The regex pins ISO-8601 with millisecond precision
  and `Z` suffix — exactly what `Date.prototype.toISOString()` emits,
  which is what the writer uses (`src/issue/materialize.ts:20`).
  Drift on this field would fail other tests too. *Acceptable.*
- **Risk: future `cycle run` changes (e.g. adding `--priority` to
  run) make this test the bottleneck for that change.** That is the
  *intended* behavior — failing this test is the signal SPEC asks
  for. The fix is to update both the production change AND this test
  in the same cycle. *Acceptable; documented in test name.*
```
