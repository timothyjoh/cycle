PLAN.md written. Summary:

- **Fix**: `tests/cli/parse-args.test.ts:101` — swap `/drop:/` → `/Option '--priority'.*(missing|requires).*argument/i`
- **Why it works**: missing-value branch wraps Node's `"Option '--priority' argument missing"` message at `parse-args.ts:34`; the `drop requires task text` path (line 39) has no `'--priority'` substring, so the new regex excludes it
- **No production code change** needed
