## Summary

Applied Fix 1: initialized `r` to a typed sentinel before the `while(true)` loop in `src/engine/run-cycle.ts` and dropped the `r!` non-null assertion. Test suite: **763/763 PASS**.
