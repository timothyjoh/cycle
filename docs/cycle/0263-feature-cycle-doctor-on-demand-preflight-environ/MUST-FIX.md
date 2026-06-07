# Must-Fix Items: Cycle 0263

## Summary
0 critical issues, 1 minor issue found in review. The implementation is
correct, well-tested, and delivers the SPEC's user benefit end-to-end. The
single minor issue is a Pass-3 doc-vs-code contradiction: the `docs/doctor.md`
example-output block shows literal lines the code does not emit.

## Tasks

- [x] ### Task 1 (Unbacked Doc Claim): `docs/doctor.md` example output diverges from actual `renderReport` output
  **Status:** ✅ Fixed
  **What was done:** Edited the fenced example block in `docs/doctor.md` so the
    rendered lines match real output: line 41 now reads `doctor: 1 check(s) failed`
    (matching `src/cli/doctor.ts:38`), and the `warn   gemini …` line (38) tail now
    reads `— this likely shadows a native Linux install; prefer a linux-x64 build or
    set CYCLE_<AGENT>_BIN.` (matching `src/engine/preflight.ts:169`). Verify greps
    confirmed: `check(s) failed` present, no bare `check failed` example line (line
    50's prose "at least one check failed" is unrelated Exit-codes text, left as-is),
    and `shadows a native Linux install` present. Docs-only change; typecheck green
    and full suite (1130 tests) passes.
  **Priority:** Minor
  **Doc:** `docs/doctor.md:41` (and `docs/doctor.md:38`)
  **Claim prose:** Example output block shows the failure summary line
    `doctor: 1 check failed` and the warning line
    `warn   gemini       gemini resolves under /mnt/c/... (WSL /mnt/c) — may be a Windows build.`
  **Expected backing:**
    - Summary line is emitted at `src/cli/doctor.ts:38` as
      `` `doctor: ${result.failures.length} check(s) failed` `` → the literal
      output for one failure is `doctor: 1 check(s) failed`, NOT
      `doctor: 1 check failed`. The doc example contradicts the code.
    - The `wsl_shadow` message is built at `src/engine/preflight.ts:169` as
      `` `${target} resolves under ${resolvedPath} (WSL /mnt/c) — this likely shadows a native Linux install; prefer a linux-x64 build or set CYCLE_<AGENT>_BIN.` ``
      The doc's `— may be a Windows build.` tail is a paraphrase that no code
      path produces.
  **Fix:** Edit the fenced example block in `docs/doctor.md` so the rendered
    lines match the real output:
    1. Change line 41 from `doctor: 1 check failed` to
       `doctor: 1 check(s) failed`.
    2. Change the `warn   gemini ...` example line (line 38) so its tail reads
       `— this likely shadows a native Linux install; prefer a linux-x64 build or set CYCLE_<AGENT>_BIN.`
       (matching `src/engine/preflight.ts:169`).
    Leave line 44 (`A clean run ends with doctor: all checks passed`) unchanged
    — it already matches `src/cli/doctor.ts:40`.
  **Verify:**
    - `grep -n "check(s) failed" docs/doctor.md` returns the updated summary
      line; `grep -n "check failed" docs/doctor.md` returns nothing.
    - `grep -n "shadows a native Linux install" docs/doctor.md` returns the
      updated warning line; cross-check it matches the string at
      `src/engine/preflight.ts:169`.
    - No code change required; `npm run typecheck` and `npm test` remain green.
