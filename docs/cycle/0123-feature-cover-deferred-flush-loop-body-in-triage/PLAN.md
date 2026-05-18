Now I have everything. Writing the plan.

# Implementation Plan: Cycle 0123

## Overview
Add one regression test to `tests/engine/triage.test.ts` driving the partial-fail deferred-flush loop with N=2 failed raws alongside one successful raw. No production code changes.

## Current State (from Research)
- Deferred-flush loop at `triage.ts:258-260` iterates `failedRaws[]` calling `moveToFailed` for each. Only exercised at N=1 today.
- Three index-aligned arrays (`failed[]`, `lastErrors[]`, `failedRaws[]`) populated at `triage.ts:218-220` — an off-by-one on second iteration would go undetected.
- Template test: `"3-attempt exhaustion: one raw fails all attempts, other succeeds"` at `triage.test.ts:438`. Pattern: mock discriminates by `prompt.includes("=== raw: <id> ===")`.
- All helpers present: `setupRepo()`, `rawBody()`, `enrichJson()`, `makeLog()`, `makeConfig()`, `parseFrontmatter`.
- File ends at line 1394 — new test appends after.

## Desired End State
One new passing test at bottom of `tests/engine/triage.test.ts`. All 9 SPEC acceptance criteria pass. `npm run test:coverage` clears the per-file ≥95% line gate for `src/engine/triage.ts`.

## What We're NOT Doing
- No changes to `src/engine/triage.ts`
- No new helper utilities
- No all-fail N≥2 path (already covered)
- No documentation updates (test-only cycle per SPEC)

## Implementation Approach
Single append to the test file. Raws named `bad1`, `bad2`, `good` — alphabetical readdir order gives deterministic `result.failed = ["bad1", "bad2"]` assertion (the index-alignment pin). Mock discriminates on `prompt.includes("=== raw: bad1 ===") || prompt.includes("=== raw: bad2 ===")`. Assertions cover all 9 AC bullets.

---

## Task 1: Add N=2 deferred-flush regression test

### Overview
Append a new `test(...)` block to `tests/engine/triage.test.ts` that sets up 3 raws, drives `runTriage`, and asserts the full return value + filesystem + log-event state.

### Changes Required

**File**: `tests/engine/triage.test.ts`  
**Change**: Append after line 1394.

```typescript
test("partial-fail deferred-flush: N=2 failed raws plus one successful raw", async () => {
  const root = await setupRepo();
  try {
    await writeFile(
      join(root, "docs/cycle/issues/raw/bad1.md"),
      rawBody("bad1", "bad raw 1"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/bad2.md"),
      rawBody("bad2", "bad raw 2"),
      "utf8",
    );
    await writeFile(
      join(root, "docs/cycle/issues/raw/good.md"),
      rawBody("good", "good raw"),
      "utf8",
    );

    const deps: TriageDeps = {
      runAgent: async (prompt) => {
        if (
          prompt.includes("=== raw: bad1 ===") ||
          prompt.includes("=== raw: bad2 ===")
        ) {
          return { exitCode: 0, stdout: "not json", stderr: "" };
        }
        return { exitCode: 0, stdout: enrichJson("good"), stderr: "" };
      },
    };
    const { log, events } = makeLog();
    const result = await runTriage(root, makeConfig(), log, deps);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.processed, ["good"]);
    // Index-alignment pin: both failing ids must appear in order
    assert.deepEqual(result.failed, ["bad1", "bad2"]);

    // Both failed raws flushed to failed/ by the deferred loop
    const failedDir = await readdir(join(root, "docs/cycle/issues/failed"));
    assert.deepEqual(failedDir, ["bad1.md", "bad2.md"]);

    for (const id of ["bad1", "bad2"]) {
      const body = await readFile(
        join(root, "docs/cycle/issues/failed", `${id}.md`),
        "utf8",
      );
      const { fm } = parseFrontmatter(body);
      assert.equal(fm.failed_step, "triage");
      assert.ok(
        typeof fm.failed_at === "string" && fm.failed_at.length > 0,
        `${id} must have non-empty failed_at`,
      );
    }

    // Successful raw's child appears in todo/ in declared order
    const todoDir = await readdir(join(root, "docs/cycle/issues/todo"));
    assert.deepEqual(todoDir, ["good.md"]);

    // tbd.jsonl has only the good raw's child; failing ids absent
    const queue = await readFile(join(root, ".cycle/tbd.jsonl"), "utf8");
    const rows = queue.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "good");
    assert.equal(queue.includes("bad1"), false, "bad1 must not appear in tbd.jsonl");
    assert.equal(queue.includes("bad2"), false, "bad2 must not appear in tbd.jsonl");

    // Successful raw moved from raw/ to done/
    const doneFiles = await readdir(join(root, "docs/cycle/issues/done"));
    assert.ok(doneFiles.includes("good_raw.md"), "good raw must move to done/");

    // No engine.paused — partial-fail path, not all-fail
    const paused = events.find((e) => e.event === "engine.paused");
    assert.equal(
      paused,
      undefined,
      "engine.paused must not fire when any raw succeeded",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

### Success Criteria
- [ ] `npm test` passes all tests (existing + new)
- [ ] `npm run test:coverage` passes; per-file gate for `src/engine/triage.ts` ≥95% line
- [ ] New test name appears in test output as passing
- [ ] `result.failed` assertion catches an off-by-one in the deferred loop (verified by reading the assertion)

---

## SPEC Acceptance Traceability

| SPEC Acceptance Bullet (verbatim) | Covering Task | Notes |
|---|---|---|
| `[ ] New test "partial-fail deferred-flush: N=2 failed raws plus one successful raw" passes` | Task 1 | Test name matches exactly |
| `[ ] docs/cycle/issues/failed/ contains exactly the two failed raw ids as <id>.md (no _raw suffix)` | Task 1 | `assert.deepEqual(failedDir, ["bad1.md", "bad2.md"])` |
| `[ ] Each failed file has frontmatter failed_step: "triage" and a non-empty failed_at ISO-8601 string` | Task 1 | Loop over `["bad1", "bad2"]` asserts both fields |
| `[ ] The successful raw's children appear in docs/cycle/issues/todo/ in declared order` | Task 1 | `assert.deepEqual(todoDir, ["good.md"])` |
| `[ ] tbd.jsonl has rows for the successful raw's children in order; failed raw ids do NOT appear in tbd.jsonl` | Task 1 | `rows[0].id === "good"` + absence checks for bad1/bad2 |
| `[ ] The successful raw moved from raw/ to done/<id>_raw.md` | Task 1 | `doneFiles.includes("good_raw.md")` |
| `[ ] No engine.paused event emitted (partial-fail path, not all-fail)` | Task 1 | `paused === undefined` assertion |
| `[ ] Existing "3-attempt exhaustion: one raw fails all attempts, other succeeds" test remains green` | Task 1 | Verified by `npm test` full suite pass |
| `[ ] npm run test:coverage passes the per-file gate for src/engine/triage.ts (line ≥ 95%)` | Task 1 | `npm run test:coverage` + `check:coverage` |

---

## Testing Strategy

### Unit Tests
- One new test, self-contained, uses `setupRepo()` + real filesystem (no mocking beyond `runAgent`).
- `runAgent` mock is minimal: two `prompt.includes` checks, returns `"not json"` or `enrichJson("good")`.
- No shared state between tests — `rm(root, { recursive: true })` in finally.

### Integration / E2E Tests
None required — `runTriage` integration via real temp git repo is the test itself.

## Risk Assessment
- **readdir ordering**: `bad1` < `bad2` < `good` alphabetically, so `result.failed = ["bad1", "bad2"]` is deterministic on any POSIX fs. macOS and Linux both return sorted order from `readdir` on ext4/APFS for small dirs.
- **enrichJson child id collision**: `enrichJson("good")` produces child `id: "good"` — same as raw id. No conflict since `good.md` in `todo/` is the child, not the raw. Matches the N=1 test pattern exactly.
