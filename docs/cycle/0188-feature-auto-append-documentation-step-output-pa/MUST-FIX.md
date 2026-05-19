# Must-Fix Items: Cycle 0188

## Summary
1 critical issue: missing test for one half of a SPEC acceptance criterion.

## Tasks

- [x] ### Task 1: Add test for BUILD.md present but missing `## Touched Files` section
  **Priority:** Critical
  **Files:** `tests/engine/run-cycle.documentation.test.ts`
  **Problem:** SPEC acceptance criterion "If BUILD.md is missing or has no `## Touched Files` section, no error is thrown" has two code paths. Test 4 ("documentation step with no BUILD.md present does not throw") covers path 1 (BUILD.md absent → `readFile` throws → caught → return). Path 2 — BUILD.md exists but contains no `## Touched Files` line — triggers the early return at `src/engine/run-cycle.ts:56` (`if (headerIdx === -1) return;`). No test ever takes this branch.
  **Fix:**
  1. Add a sixth test to `tests/engine/run-cycle.documentation.test.ts` after the existing five.
  2. Use a two-step build→documentation workflow (same scaffold as Tests 1–3 via `setupBuildDocWorkflow`).
  3. Override the fake build step so its stdout does **not** contain `## Touched Files` — e.g., emit only `All done.` with no Touched Files section.
  4. Let the documentation step's fake script modify `README.md` as usual.
  5. After `runCycle`, assert `r.status === "ok"` and `cycleEnd.status === "ok"` (no throw, cycle completes).
  6. Optionally read BUILD.md and assert `README.md` does NOT appear (since the append was skipped).

  Minimal test skeleton:
  ```typescript
  test("runCycle: documentation step with BUILD.md having no Touched Files section does not throw", async () => {
    const root = await mkdtemp(join(tmpdir(), "cycle-doc-notf-"));
    const bin  = await mkdtemp(join(tmpdir(), "cycle-doc-notf-bin-"));
    try {
      await setupGitRepoWithReadme(root);
      // Use setupBuildDocWorkflow but with a buildTouchedFiles string that has NO ## Touched Files header
      await setupBuildDocWorkflow(root, bin, "Build complete. No section here.\\n");
      const r = await runCycle(root, {
        issueId: "NOTF-1",
        title: "doc no touched files section",
        workflow: "feature",
        env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" },
      });
      assert.equal(r.status, "ok");
      const log = await readFile(join(root, ".cycle/log.jsonl"), "utf8");
      const events = parseLog(log);
      const cycleEnd = expectExactlyOne(events, "cycle.end");
      assert.equal(cycleEnd.status, "ok");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(bin,  { recursive: true, force: true });
    }
  });
  ```
  Note: `setupBuildDocWorkflow`'s fake build script uses `printf '${buildTouchedFiles}'` — pass a string without a `## Touched Files` line. The empty-diff guard still requires the build step to create `src/dummy.ts`; `setupBuildDocWorkflow` already does this unconditionally (the `mkdir -p "${root}/src"` + `echo '// marker'` lines are in the `fakeBuild` script independent of the `buildTouchedFiles` content).
  **Verify:** `npm run test:coverage` shows `src/engine/run-cycle.ts` branch coverage increases (the `headerIdx === -1` branch is now taken). All tests pass.
  **Status:** ✅ Fixed
  **What was done:** Added test "runCycle: documentation step with BUILD.md having no Touched Files section does not throw" to `tests/engine/run-cycle.documentation.test.ts` using `setupBuildDocWorkflow` with a build output string containing no `## Touched Files` header. Asserts `r.status === "ok"`, `cycleEnd.status === "ok"`, and that README.md does not appear in BUILD.md. `run-cycle.ts` branch coverage increased from 91.47% → 93.88%. 528 tests pass; all coverage floors met (Line 98.48%, Branch 91.57%, Function 93.18%).
