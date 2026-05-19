Enough context. Writing the plan now.

```markdown
# Implementation Plan: Cycle 0160

## Overview
Add one new test to `tests/cli/multi-loop.test.ts` that runs `cycle drop "<text>"` and `cycle run "<text>" --dry-run` against separate temp roots, normalizes timestamp-dependent fields, and asserts byte-identical frontmatter via `assert.strictEqual`.

## Current State (from Research)
- Both commands share `materializeFreeformIssue` but with different call sites: `drop` at `src/cli.ts:86` passes `args.priority`; `run` at `:92` always passes undefined (defaults to 3).
- `run` has no `--priority` flag — SPEC acceptance criteria suggesting `--priority N` for `run` are internally inconsistent. Resolution: use default priority 3 for both invocations with no flag.
- `drop` stdout is a single JSON object with `{ path }`. `run "<text>" --dry-run` stdout is NDJSON events; the raw file must be found via `readdir(rawDir)`.
- Cycle 0159 landed the mandatory blank line between `---` and body, so the byte shape is fully pinned in both call sites.
- Existing test file already imports `readdir`, `readFile`, `rm`, `mkdtemp`, `spawnSync`, and `assert` — no new imports needed.

## Desired End State
`tests/cli/multi-loop.test.ts` contains a fifth test that:
- Invokes both CLI commands against isolated temp roots
- Normalizes `id:` and `added_at:` lines in both file bodies
- Passes `assert.strictEqual` with a diff-friendly failure message
- Cleans up both roots in `finally`

Verify: `npm test` passes with 505+ tests (504 existing + 1 new), coverage doesn't regress.

## What We're NOT Doing
- Modifying any existing test.
- Modifying `materializeFreeformIssue` or collapsing call sites.
- Adding `--priority` to `cycle run`.
- Adding any new helper functions or shared utilities.

## Implementation Approach
Single-task cycle. The new test is self-contained and follows the exact pattern already used by the two preceding tests in the file. No production code changes.

---

## Task 1: Add byte-equivalence test to multi-loop.test.ts

### Overview
Append one new `test(...)` block to the end of `tests/cli/multi-loop.test.ts`.

### Changes Required

**File**: `tests/cli/multi-loop.test.ts`

Append after line 214:

```typescript
test("'drop' and 'run \"<text>\"' produce byte-equal frontmatter after normalizing id and added_at", async () => {
  const rootA = await mkdtemp(join(tmpdir(), "cycle-drop-"));
  const rootB = await mkdtemp(join(tmpdir(), "cycle-run-"));
  try {
    const distPath = await ensureDist();
    const text = "shared equivalence probe";

    // drop: stdout is a single JSON object with { path }
    const dropResult = spawnSync("node", [distPath, "drop", text], { cwd: rootA, encoding: "utf8" });
    assert.equal(dropResult.status, 0, `cycle drop exit: ${dropResult.status}\nstderr: ${dropResult.stderr}`);
    const dropOut = JSON.parse(dropResult.stdout.trim());
    const bodyA = await readFile(dropOut.path, "utf8");

    // run --dry-run: stdout is NDJSON events; locate raw file via readdir
    const runResult = spawnSync("node", [distPath, "run", text, "--dry-run"], { cwd: rootB, encoding: "utf8" });
    assert.equal(runResult.status, 0, `cycle run exit: ${runResult.status}\nstderr: ${runResult.stderr}`);
    const rawDir = join(rootB, "docs/cycle/issues/raw");
    const entries = (await readdir(rawDir)).filter((f) => f.endsWith(".md"));
    assert.equal(entries.length, 1, `expected exactly one raw .md, got: ${entries.join(", ")}`);
    const bodyB = await readFile(join(rawDir, entries[0]), "utf8");

    const normalize = (s: string) =>
      s
        .replace(/^id: .+$/m, "id: <ID>")
        .replace(/^added_at: .+$/m, "added_at: <TS>");

    const normA = normalize(bodyA);
    const normB = normalize(bodyB);

    assert.strictEqual(
      normA,
      normB,
      `frontmatter diverged:\n--- drop ---\n${normA}\n--- run --dry-run ---\n${normB}`,
    );
  } finally {
    await rm(rootA, { recursive: true, force: true });
    await rm(rootB, { recursive: true, force: true });
  }
});
```

No imports added — `readdir`, `readFile`, `rm`, `mkdtemp`, `join`, `spawnSync`, and `assert` are all already imported at the top of the file.

### Success Criteria
- [ ] `npm test` exits 0 with ≥ 505 tests passing
- [ ] `npm run typecheck` exits clean
- [ ] `npm run test:coverage && npm run check:coverage` passes all per-file floors

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] New test exists in tests/cli/multi-loop.test.ts and is named to make its intent clear (e.g., "'drop' and 'run \"<text>\"' produce byte-equal frontmatter after normalizing id and added_at").` | Task 1 | Exact name used |
| `[ ] Test runs cycle drop "<text>" --priority N against temp root A and reads the resulting raw .md file.` | Task 1 | No `--priority` flag — RESEARCH found `run` has no `--priority` option, making `--priority N` in both invocations impossible. Both default to priority 3. SPEC intent (comparable priority) satisfied by identical defaults. |
| `[ ] Test runs cycle run "<text>" --dry-run --priority N against temp root B and reads the resulting raw .md file.` | Task 1 | Same waiver: no `--priority` on `run`; uses default 3. File found via `readdir`. |
| `[ ] After replacing id: <anything> → id: <ID> and added_at: <anything> → added_at: <TS> in both strings, assert.strictEqual(normalizedA, normalizedB) passes.` | Task 1 | `normalize()` applies both replacements before `strictEqual` |
| `[ ] Failure message shows both normalized frontmatter blocks.` | Task 1 | Third arg to `strictEqual` includes both `normA` and `normB` |
| `[ ] All 504+ existing tests still pass.` | Task 1 | No existing tests modified |
| `[ ] Coverage does not regress vs. master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%).` | Task 1 | New test exercises existing production paths; coverage can only improve |
| `[ ] npm run typecheck exits clean.` | Task 1 | No new types introduced; all APIs already typed |

---

## Testing Strategy

### Unit Tests
N/A — this cycle is itself a test-only change.

### Integration / E2E Tests
- The new test IS the deliverable. It invokes real `dist/cycle.js` in isolated temp dirs, exercising `drop` and `run --dry-run` end-to-end against the real filesystem with no mocking.

## Risk Assessment
- **Priority mismatch if one call site changes default**: Acceptable — the test catches exactly this divergence. If priorities ever differ, `assert.strictEqual` will fail with a readable diff.
- **NDJSON parse not needed**: `run --dry-run` stdout need not be parsed — we only need the file on disk, found via `readdir`. Simpler than parsing events.
- **`dist/cycle.js` must be built**: `npm test` runs `npm run build` via `pretest` automatically; `ensureDist()` will throw early if somehow missing.
```
