# Must-Fix Items: Cycle 0009

## Summary

0 critical, 3 minor test-coverage gaps. Implementation is functionally
correct and all 76 tests pass; these tasks tighten regression coverage
for behaviors the SPEC / PLAN explicitly named but did not get
assertions.

## Tasks

- [x] ### Task 1: Add dedup-across-frontmatter+body test for `closes_block`
  **Status:** ✅ Fixed
  **What was done:** Appended verbatim test to `tests/defaults/closes-linkage.test.ts` immediately above the `empty repo_slug` test. Writes a markdown file with the same `acme/repo/issues/42` URL in both YAML `title:` and body, asserts a single `Closes #42\n` line. Passes.


  **Priority:** Minor
  **Files:** `tests/defaults/closes-linkage.test.ts`
  **Problem:** Current tests cover (a) multi-URL dedup within the body
  (lines 45-59) and (b) URL in frontmatter alone (lines 113-128), but
  not the cross-section case: a URL that appears in both the YAML
  `title:` field AND the body should still dedup to a single
  `Closes #N` line. SPEC requires dedup; whole-file scan is the chosen
  implementation; this is the most likely regression path if anyone
  later splits the scan by section.
  **Fix:** Append a new test:
  ```ts
  test("closes_block: dedups across frontmatter title and body", async () => {
    const dir = await mkdtemp(join(tmpdir(), "closes-"));
    try {
      const f = join(dir, "issue.md");
      await writeFile(
        f,
        "---\n" +
          "title: fix https://github.com/acme/repo/issues/42\n" +
          "---\n" +
          "Body also refs https://github.com/acme/repo/issues/42.\n",
      );
      assert.equal(callCloses(f, "acme/repo"), "Closes #42\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm test -- tests/defaults/closes-linkage.test.ts` —
  new test passes; total count is 77.

- [x] ### Task 2: Add PR-URL (`/pull/<N>`) skip test for `closes_block`
  **Status:** ✅ Fixed
  **What was done:** Appended verbatim test asserting that a body containing both a `/pull/7` and an `/issues/8` URL emits exactly `Closes #8\n`. Confirms regex requires literal `/issues/`. Passes.


  **Priority:** Minor
  **Files:** `tests/defaults/closes-linkage.test.ts`
  **Problem:** SPEC out-of-scope list (line 24) explicitly excludes
  PR-URL references: only `/issues/<N>` URLs trigger linkage.
  Implementation regex requires literal `/issues/`, so PR URLs are
  correctly skipped — but no test asserts this. A future "support
  pulls too" change could silently regress the SPEC contract with no
  red test.
  **Fix:** Append a new test:
  ```ts
  test("closes_block: pull-request URLs are not treated as issues", async () => {
    const dir = await mkdtemp(join(tmpdir(), "closes-"));
    try {
      const f = join(dir, "issue.md");
      await writeFile(
        f,
        "Refs PR https://github.com/acme/repo/pull/7 and " +
          "issue https://github.com/acme/repo/issues/8.\n",
      );
      assert.equal(callCloses(f, "acme/repo"), "Closes #8\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  ```
  **Verify:** `npm test -- tests/defaults/closes-linkage.test.ts` —
  new test passes; assertion is exactly `"Closes #8\n"` (PR #7 absent).

- [x] ### Task 3: Assert `gh repo view` invoked exactly once in `pr.sh`
  **Status:** ✅ Fixed
  **What was done:** Destructured `log` from the existing `installPrGhShim` call inside `pr.sh: PR body appends Closes #N when issue URL matches repo`. After the body assertion, read `gh.argv.log`, split on `\n`, filtered with `/(^|\0)repo\0view\0/`, and asserted exactly one match. Passes.


  **Priority:** Minor
  **Files:** `tests/defaults/closes-linkage.test.ts`
  **Problem:** PLAN Task 4 success criterion (PLAN.md:285): "Single
  `repo_slug` resolution per script invocation (no duplicate
  `gh repo view` calls visible in the shim log)." The `installPrGhShim`
  helper already writes argv to `gh.argv.log` (lines 318-327), but no
  test reads or asserts on the log. A regression that re-introduces
  the duplicate `gh repo view` call (one for closes, one for fallback)
  would slip through.
  **Fix:** In the existing test `pr.sh: PR body appends Closes #N
  when issue URL matches repo` (lines 359-386), after the body
  assertion, add:
  ```ts
  const log = await readFile(join(root, "gh.argv.log"), "utf8");
  const repoViewCalls = log
    .split("\n")
    .filter((l) => /(^|\0)repo\0view\0/.test(l));
  assert.equal(
    repoViewCalls.length,
    1,
    `expected exactly one gh repo view call; got ${repoViewCalls.length}: ${log}`,
  );
  ```
  (The shim writes argv as NUL-separated tokens, hence the `\0` lookups.)
  **Verify:** `npm test -- tests/defaults/closes-linkage.test.ts` —
  assertion passes with current code; if you temporarily duplicate the
  `gh repo view` line in `src/defaults/scripts/pr.sh` and re-sync via
  `node scripts/sync-defaults.mjs`, the test must fail with count 2.
