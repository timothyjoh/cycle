# Must-Fix Items: Cycle 0109

## Summary
2 minor issues found in review.

## Tasks

- [x] ### Task 1: Update stale npm test result in DOCUMENTATION.md
  **Priority:** Minor
  **Files:** `docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/DOCUMENTATION.md`
  **Problem:** Lines 31–32 say "Pre-existing triage test failure (`tests/cli/triage.test.ts` — child-reference batching error) causes `npm test` to exit non-zero" and "No new failures were introduced by cycle 0109's changes (which are documentation-only, zero src/ edits)." Both claims are false in the final cycle state: the build step fixed the triage failures by changing `$2` → `$3` in two test stubs (`tests/cli/triage.test.ts:34`, `tests/cli/triage-dry-run.test.ts:43`), and `npm test` exits 0 with 438 passing.
  **Fix:** Replace the `### npm test Result` section (lines 30–33) with:
  ```markdown
  ### npm test Result

  438 pass, 0 fail. The pre-existing triage test failure (child-reference batching, `$2` vs `$3` argument shift caused by `--dangerously-skip-permissions` added to `exec-claudecode.ts`) was fixed in the build step by updating both fake-Claude stubs to read `$3` instead of `$2`. No new failures introduced.
  ```
  **Verify:** `grep "438 pass" docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/DOCUMENTATION.md` returns a match; the old "causes \`npm test\` to exit non-zero" sentence is gone.
  **Status:** ✅ Fixed
  **What was done:** Replaced stale npm test section with accurate result: 438 pass, 0 fail, and explained the $2→$3 fix.

- [x] ### Task 2: Remove markdown code fence wrapping PLAN.md body
  **Priority:** Minor
  **Files:** `docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/PLAN.md`
  **Problem:** Line 8 opens a ` ```markdown ``` ` fence and the final line closes it, wrapping the entire plan — including the SPEC Acceptance Traceability table at line 204 — in a raw code block. The table renders as preformatted text, not a Markdown table. This was also noted in the prior REVIEW.md as a minor artifact and was not fixed.
  **Fix:** Delete line 1 (`All open questions resolved. Writing PLAN.md now.`), the blank line, the ` ```markdown ``` ` opening fence (line 8 approx), and the closing ` ``` ` at the end of the file. Leave all content between the fences unchanged.
  **Verify:** `head -5 docs/cycle/0109-feature-traceability-record-confirm-cycle-0078-r/PLAN.md` should start with `# Implementation Plan`; `tail -3` should end with the last table row or section content, not ` ``` `.
  **Status:** ✅ Fixed
  **What was done:** Removed 8-line preamble (meta note + **Resolved:** block + opening ```markdown fence) and closing ``` from PLAN.md. File now starts with `# Implementation Plan`.
