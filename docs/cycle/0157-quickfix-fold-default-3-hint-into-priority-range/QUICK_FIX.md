Typecheck clean. 

`src/cli/parse-args.ts:47` — appended `  (N is an integer 1..10, default 3)` to the range-rejection error message so both the invalid-type path (path #1) and the out-of-range path (path #2) now surface the default value consistently. No other changes were made.
