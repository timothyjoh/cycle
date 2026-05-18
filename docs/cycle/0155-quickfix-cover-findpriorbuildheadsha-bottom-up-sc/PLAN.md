## Fix

No production code changes required. Test-only addition.

## Test

- File: `tests/engine/run-cycle.test.ts`
- Test name: `findPriorBuildHeadSha returns newer sha when two build step.start rows exist for same cycle`

### What to add

Append a new `test(...)` block to `tests/engine/run-cycle.test.ts`.

Fixture log (written to a tmp `.cycle/log.jsonl`):

```
{"event":"step.start","step":"build","cycle_id":"0099","head_sha":"OLD_SHA"}
{"event":"step.warning","step":"build","cycle_id":"0099","reason":"build_pre_sha_missing"}
{"event":"step.start","step":"build","cycle_id":"0099","head_sha":"NEW_SHA"}
```

Assertion: `await findPriorBuildHeadSha(repoRoot, "0099")` === `"NEW_SHA"`.

The test must use a fresh tmp dir with `.cycle/log.jsonl` written directly (no git init needed — `findPriorBuildHeadSha` only reads the log file). Import `findPriorBuildHeadSha` from `../../src/engine/run-cycle.ts` (already imported at line 7).
