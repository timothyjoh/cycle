Need write permission for the plan directory. PLAN.md content ready — here it is for manual save or approve:

**`docs/cycle/0145-quickfix-pin-runclitriage-two-arg-wrapper-delegat/PLAN.md`**

```markdown
## Fix

- File: `tests/cli/triage-handler.test.ts` (append new test after line 84)
- Change: Add a dedicated `triage-wrapper-delegation` test that calls the two-arg `runCliTriage` directly against an empty `raw/` dir and asserts exact shape `{exitCode: 0, stdout: '[]\n'}`

## Test

- File: `tests/cli/triage-handler.test.ts`
- Test name: `"triage-wrapper-delegation: runCliTriage(root, ['--dry-run']) delegates to runCliTriageWithDeps with empty deps"`
- Asserts: `result.exitCode === 0` and `result.stdout === '[]\n'`
- Calls: `runCliTriage` (two-arg form, not `runCliTriageWithDeps`) so wrapper line 46 is exercised as a named contract

## Notes

The existing test at line 75 exercises the same code path but uses `JSON.parse(result.stdout)` — it does not pin the exact `'[]\n'` string and does not carry a name that documents the wrapper-delegation contract. The new test is additive; no existing tests change.
```

**Key finding:** `triage-handler.test.ts:78` already calls `runCliTriage` with `--dry-run` on empty `raw/`, but asserts via `JSON.parse` not exact string. The new test pins the literal `'[]\n'` and names the wrapper-delegation contract explicitly. No production code changes.
