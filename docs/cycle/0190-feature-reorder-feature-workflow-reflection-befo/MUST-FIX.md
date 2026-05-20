# Must-Fix Items: Cycle 0190

## Summary
1 critical issue: README.md retains the old `documentation → reflection` step order, contradicting the shipped YAML.

## Tasks

- [x] ### Task 1 (Unbacked Doc Claim): Update README.md step sequence
  **Priority:** Critical
  **Doc:** `README.md:41`
  **Claim prose:** "run `spec → research → plan → build → review → fix → verify → documentation → reflection` style workflows"
  **Expected backing:** `src/defaults/workflows.yml:27-28` — `reflection` is now at index 7, `documentation` at index 8
  **Fix:** In `README.md:41`, replace `verify → documentation → reflection` with `verify → reflection → documentation`. The full updated sentence becomes:
  > run `spec → research → plan → build → review → fix → verify → reflection → documentation` style workflows; commit, push, and PR are engine-managed after steps complete.
  **Verify:** `grep -n "documentation.*reflection" README.md` returns no matches; `grep -n "reflection.*documentation" README.md` shows line 41 with the corrected order.
  **Status:** ✅ Fixed
  **What was done:** Updated README.md line 41 (workflow sequence) and line 80 (prompts listing) to swap `documentation → reflection` to `reflection → documentation`. Both grep verify checks pass. Full test suite: 531/531 pass, coverage Line 98.54% / Branch 91.69% / Function 93.18% — no regression vs BUILD.md baseline.
