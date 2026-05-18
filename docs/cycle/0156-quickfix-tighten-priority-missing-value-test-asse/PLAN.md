## Fix

- File: `tests/cli/parse-args.test.ts:101`
- Change: Replace `/drop:/` with `/Option '--priority'.*(missing|requires).*argument/i` to pin the assertion to the node:util missing-argument error path, not the generic `drop:` prefix

## Test

- File: `tests/cli/parse-args.test.ts`
- Test name: `"rejects --priority with no value"` (line 98)
- Assert: regex matches the Node.js `Option '--priority' argument missing` message embedded in the wrapper, NOT the `drop requires task text` path (add inline comment confirming this)

## Context

- Missing-value path (src/cli/parse-args.ts:32–35): `nodeParseArgs` throws → caught → re-wrapped as `drop: <node message> (usage: cycle drop ...)`
- "No text" path (src/cli/parse-args.ts:39): throws `drop requires task text` — no `Option '--priority'` substring → new regex correctly excludes it
- No production-code change needed; error message is already specific enough to pin against
