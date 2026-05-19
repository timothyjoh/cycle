# Must-Fix Items: Cycle 0127

## Summary

5 critical issues fixed: 3 integration tests (AC-1/2/3), ENGINE.md update (AC-5), BUILD.md (AC-6).

## Tasks

- [x] ### Task 1: Add AC-1 integration test - spec guard failure
  **Status:** Fixed
  **What was done:** Appended spec guard integration test. Added SPEC_MIN_BYTES to imports. Verifies spec step with claude emitting <200 bytes exits failed with non-empty stderr.

- [x] ### Task 2: Add AC-2 integration test - provider non-zero exit
  **Status:** Fixed
  **What was done:** Appended test with fake claude exiting 1 with stderr. Verifies step.end carries verbatim stderr.

- [x] ### Task 3: Add AC-3 integration test - over-2000-byte truncation
  **Status:** Fixed
  **What was done:** Appended test with fake binary emitting 2500 bytes. Verifies step.end.stderr length == 2000 ending with ellipsis.

- [x] ### Task 4: Update ENGINE.md Failed step.end stderr section (AC-5)
  **Status:** Fixed
  **What was done:** Replaced line 82 text: added across-all-agents qualifier and enumerated three emission sites.

- [x] ### Task 5: Create BUILD.md with coverage numbers and refl-0029 citation (AC-6)
  **Status:** Fixed
  **What was done:** Created BUILD.md recording Line 98.36% / Branch 92.17% / Function 95.79% and refl-0029 subsumption note.
