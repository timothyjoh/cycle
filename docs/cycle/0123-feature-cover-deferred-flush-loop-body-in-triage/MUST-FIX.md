# Must-Fix Items: Cycle 0123

## Summary
1 critical issue: the sole deliverable was not implemented. BUILD.md records only "Need write permission to the test file." — the builder was denied write access to tests/engine/triage.test.ts and stopped without adding the N=2 regression test.

## Tasks

- [ ] ### Task 1: Add N=2 partial-fail deferred-flush regression test
  **Priority:** Critical
  **Files:** tests/engine/triage.test.ts
  **Problem:** The new test "partial-fail deferred-flush: N=2 failed raws plus one successful raw" was never appended. File ends at line 1394 — unchanged from pre-cycle baseline except for a makeConfig() maintenance edit on line 25. Zero of 9 SPEC acceptance criteria are met.
  **Fix:** Append the block from PLAN.md Task 1 (lines 39-120) verbatim after the closing }); on line 1394. All required identifiers (writeFile, readdir, readFile, rm, join, assert, parseFrontmatter, TriageDeps, runTriage, makeLog, makeConfig, setupRepo, rawBody, enrichJson) are already imported in the test file.
  **Verify:**
  1. npm test passes — all existing + new test green.
  2. New test name appears in output: partial-fail deferred-flush: N=2 failed raws plus one successful raw.
  3. npm run test:coverage passes; npm run check:coverage reports src/engine/triage.ts line >= 95%.
