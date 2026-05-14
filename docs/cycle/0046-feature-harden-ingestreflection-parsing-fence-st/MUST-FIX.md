# Must-Fix Items: Cycle 0046

## Summary
0 critical issues, 2 minor issues found in review. Implementation meets SPEC acceptance criteria (350/350 tests, coverage 98.44 / 91.56 / 96.32 — all above baseline). The two items below tighten direct test coverage of newly-added robustness branches in `parseWithRepair` and `trimToLastBalancedClose` (currently uncovered: `src/engine/reflection.ts` lines 140-141, 163, 165). Both are mechanical test additions; no production code changes required.

## Tasks

- [x] ### Task 1: Cover the post-repair `JSON.parse` failure path (lines 140-141)
  **Status:** ✅ Fixed
  **What was done:** Added test `repair-substring still invalid JSON escalates with second-parse error message` to `tests/engine/reflection.test.ts`. Uses `"{x:1} trailing prose"` so `trimToLastBalancedClose` returns `{x:1}` (balanced) and the inner `JSON.parse(repaired)` throws on the unquoted key, exercising the `e2` catch at `src/engine/reflection.ts:139-141`. Asserts skip event `reason: parse_error`, message matches `/JSON|token|expected/i`, and summary `count: 0, skipped: 1`. Lines 140-141 no longer appear in the uncovered list.

  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts`
  **Problem:** `parseWithRepair` has an inner `try/catch` at `src/engine/reflection.ts:137-141` that fires when `trimToLastBalancedClose` returns a non-null substring but `JSON.parse(repaired)` still throws (e.g. unquoted keys inside the balanced span). No existing test exercises this branch — the existing `unbalanced braces escalate without looping` test takes the `repaired === null` shortcut (line 136), not the e2 catch. Coverage report flags lines 140-141 as uncovered. Without this test, the `(e2 as Error).message` path can silently regress (e.g. a future refactor swallowing the second error) without any test going red.
  **Fix:** Add a new test after the existing `unbalanced braces escalate without looping` test (around `tests/engine/reflection.test.ts:223`):
  ```ts
  test("ingestReflection: repair-substring still invalid JSON escalates with second-parse error message", async () => {
    const root = await setupRepo();
    try {
      const { events, logger } = makeLogger();
      // Balanced braces, but inner content is not valid JSON (unquoted key).
      // First JSON.parse fails. trimToLastBalancedClose returns `{x:1}`.
      // Second JSON.parse also fails. Escalation runs once.
      const r = await ingestReflection(root, CID, SLUG, "{x:1} trailing prose", logger);
      assert.deepEqual(r, { written: [`refl-${CID}-parse-error`], skipped: 1 });
      const skip = events.find((e) => e.event === "reflection.skipped");
      assert.ok(skip);
      assert.equal(skip!.fields.reason, "parse_error");
      // The message must come from the *second* parse attempt (post-repair),
      // not the first — concrete way to pin the e2 branch.
      assert.match(String(skip!.fields.message), /JSON|token|expected/i);
      const summary = events.find((e) => e.event === "reflection.summary");
      assert.equal(summary!.fields.count, 0);
      assert.equal(summary!.fields.skipped, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm run test:coverage` — `src/engine/reflection.ts` lines 140-141 no longer appear in the uncovered list; new test passes; total test count = 351.

- [x] ### Task 2: Cover the string-escape branches in `trimToLastBalancedClose` (lines 163, 165)
  **Status:** ✅ Fixed
  **What was done:** Added test `repair pass handles backslash-escaped quotes inside JSON strings` to `tests/engine/reflection.test.ts`. `JSON.stringify` produces `\"` inside the title, plus trailing prose to force the repair pass. Without correct escape handling the scanner would mis-balance depth at the first escaped `"`; with `esc` state intact the substring parses and the title round-trips as `fix: "quoted" title`. Lines 163 and 165 no longer in the uncovered list.

  **Priority:** Minor
  **Files:** `tests/engine/reflection.test.ts`
  **Problem:** `trimToLastBalancedClose` at `src/engine/reflection.ts:161-169` has a string-aware scanner that tracks backslash-escape state (`esc = true` on `\`, `esc = false` on the next char). These branches handle inputs like `"title": "has \" quote"` where the escaped `"` must NOT toggle string state. No existing test exercises a JSON payload that contains a `\` inside a string AND requires the repair pass to run — the existing `repair pass handles JSON strings containing braces` test (`:190-208`) uses `{literal}` braces (no escapes), and the `title containing colon and quote round-trips` test (`:456-473`) parses cleanly with no trailing prose, so it never enters `trimToLastBalancedClose`. Coverage report flags lines 163 and 165 as uncovered. Without this test, the escape-handling logic could regress (e.g. someone removing the `esc` state) and the scanner would silently mis-balance any payload with an escaped `"` inside a JSON string, causing repair to truncate at the wrong index and the second parse to fail — observable only as a parse_error escalation in production.
  **Fix:** Add a new test after the existing `repair pass handles JSON strings containing braces` test (around `tests/engine/reflection.test.ts:208`):
  ```ts
  test("ingestReflection: repair pass handles backslash-escaped quotes inside JSON strings", async () => {
    const root = await setupRepo();
    try {
      const { logger } = makeLogger();
      // Title contains an embedded `"` which JSON.stringify escapes as `\"`.
      // Without escape-aware scanning, the trimmer would think the string
      // closed early and mis-balance depth.
      const stdout =
        JSON.stringify({
          sharp_edges: [
            { title: 'fix: "quoted" title', body: "ok", priority_hint: 4 },
          ],
        }) + "\ntrailing prose to force repair pass";
      const r = await ingestReflection(root, CID, SLUG, stdout, logger);
      assert.equal(r.skipped, 0);
      assert.equal(r.written.length, 1);
      const p = join(root, "docs/cycle/issues/raw", `${r.written[0]}.md`);
      const body = await readFile(p, "utf8");
      const { fm } = parseFrontmatter(body);
      assert.equal(fm.title, 'fix: "quoted" title');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm run test:coverage` — `src/engine/reflection.ts` lines 163 and 165 no longer appear in the uncovered list; new test passes; total test count = 351 (or 352 if Task 1 also lands).
