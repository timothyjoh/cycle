All gates pass. 

Added test `"range-rejection error mentions default 3"` to `tests/cli/parse-args.test.ts` — asserts `parseArgs(["drop", "foo", "--priority", "0"])` throws with message matching `/default 3/`, pinning that path #2's range-error now includes the default hint verbatim. Full suite: **504/504 pass** (was 503; +1 new test). Coverage: line 98.41%, branch 91.43%, function 92.83% — all per-file floors met, no regression vs baseline.
