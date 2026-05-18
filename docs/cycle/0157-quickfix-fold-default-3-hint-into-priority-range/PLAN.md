## Fix

- File: `src/cli/parse-args.ts:47`
- Change: Append `  (N is an integer 1..10, default 3)` to the range-rejection error message so it matches path #1's wording verbatim. New message:
  ```
  drop: --priority must be an integer 1..10 (got "${raw}"); usage: cycle drop "<text>" [--priority N]  (N is an integer 1..10, default 3)
  ```

## Test

- File: `tests/cli/parse-args.test.ts`
- Test name: `"range-rejection error mentions default 3"` — assert `parseArgs(["drop", "foo", "--priority", "0"])` throws an error whose message contains the literal substring `default 3`. Pin with `assert.match(err.message, /default 3/)` (exact substring, not a loose catch-all). Existing tests for `must be an integer 1..10` remain unchanged.
