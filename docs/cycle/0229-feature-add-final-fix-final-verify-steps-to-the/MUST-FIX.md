# Must-Fix Items: Cycle 0229

## Summary
2 critical issues found in review.

## Tasks

- [x] ### Task 1: Add "You are writing a file" sentence to `final_fix.md`
  **Priority:** Critical
  **Files:** `src/defaults/prompts/final_fix.md`, `.cycle/prompts/final_fix.md`
  **Status:** ✅ Fixed
  **What was done:** Inserted the canonical guardrail sentence at the start of the `## File Artifact Mode` section body in `src/defaults/prompts/final_fix.md`. Also changed the three bullet-list items from capitalized ("Insight blocks…", "Confirmation sentences…", "Trailing commentary…") to lowercase ("insight blocks or star-marker…", "confirmation sentences…", "trailing commentary…") so that the Task 2 guardrail tests (which check lowercase strings) all pass. Ran `npm run sync-defaults`; `diff src/defaults/prompts/final_fix.md .cycle/prompts/final_fix.md` exits 0.

- [x] ### Task 2: Add `final_fix.md` guardrail tests to `file-artifact-mode-guardrail.test.ts`
  **Priority:** Critical
  **Files:** `tests/defaults/file-artifact-mode-guardrail.test.ts`
  **Problem:** Every other artifact prompt (`build.md`, `research.md`, `fix.md`, `documentation.md`, `spec.md`, `plan.md`, `review.md`) is covered by at least 5 pinning tests: four FAM-phrase presence assertions and one dogfood byte-identity check. `final_fix.md` is now in `ARTIFACT_STEPS` but has zero guardrail tests. The SPEC AC states "`.cycle/prompts/final_fix.md` is byte-identical after `npm run sync-defaults`" — this claim is currently verified only by the builder's manual `diff` during build, not by any automated test. A future `fix` step could silently remove the FILE ARTIFACT MODE directive or allow the dogfood copy to drift.
  **Fix:** After completing Task 1, add the following five tests to `tests/defaults/file-artifact-mode-guardrail.test.ts` (follow the exact pattern used for `fix.md` at lines 122–174):
  ```ts
  const FINAL_FIX_SRC = "src/defaults/prompts/final_fix.md";
  const FINAL_FIX_DOG = ".cycle/prompts/final_fix.md";

  test("final_fix prompt File Artifact Mode identifies output as a file not a conversation", async () => {
    const body = await readFile(FINAL_FIX_SRC, "utf8");
    assert.ok(
      body.includes("You are writing a file, not responding in a conversation"),
      "missing File Artifact Mode guardrail sentence in final_fix.md",
    );
  });

  test("final_fix prompt File Artifact Mode prohibits insight blocks and star-marker commentary", async () => {
    const body = await readFile(FINAL_FIX_SRC, "utf8");
    assert.ok(body.includes("insight blocks or star-marker"), "missing insight blocks / star-marker prohibition in final_fix.md");
  });

  test("final_fix prompt File Artifact Mode prohibits confirmation sentences", async () => {
    const body = await readFile(FINAL_FIX_SRC, "utf8");
    assert.ok(body.includes("confirmation sentences"), "missing confirmation sentences prohibition in final_fix.md");
  });

  test("final_fix prompt File Artifact Mode prohibits trailing commentary", async () => {
    const body = await readFile(FINAL_FIX_SRC, "utf8");
    assert.ok(body.includes("trailing commentary"), "missing trailing commentary prohibition in final_fix.md");
  });

  test("final_fix prompt File Artifact Mode includes concrete negative example", async () => {
    const body = await readFile(FINAL_FIX_SRC, "utf8");
    assert.ok(body.includes("**WRONG**"), "missing WRONG/CORRECT negative example in final_fix.md FAM section");
  });

  test("final_fix prompt contains inline FILE ARTIFACT MODE directive", async () => {
    const body = await readFile(FINAL_FIX_SRC, "utf8");
    assert.ok(
      body.includes("FILE ARTIFACT MODE: Output only the document contents requested"),
      "missing inline FILE ARTIFACT MODE directive in final_fix.md",
    );
  });

  test("dogfood final_fix prompt is byte-identical to default", async () => {
    const [src, dog] = await Promise.all([readFile(FINAL_FIX_SRC), readFile(FINAL_FIX_DOG)]);
    assert.equal(Buffer.compare(src, dog), 0, "src/defaults/prompts/final_fix.md and .cycle/prompts/final_fix.md must match byte-for-byte");
  });
  ```
  **Verify:** `npm test` passes with 679 tests (672 + 7 new); all seven new tests pass; `grep -c "final_fix" tests/defaults/file-artifact-mode-guardrail.test.ts` returns ≥ 7.
  **Status:** ✅ Fixed
  **What was done:** Added 7 tests (matching the exact pattern provided in MUST-FIX) to `tests/defaults/file-artifact-mode-guardrail.test.ts`. All 679 tests pass (672 prior + 7 new). `grep -c "final_fix"` returns 16 (≥ 7).
