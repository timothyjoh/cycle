---
id: refl-0203-buildchildenv-strip-and-re-inject-contra-integration-test
title: "Integration test: assert CYCLE_ID and CYCLE_BASE reach subprocess env"
workflow: feature
depends_on: [refl-0203-buildchildenv-strip-and-re-inject-contra-structural-invariant]
triaged_at: "2026-05-21T05:14:48.128Z"
source: triage
parent: refl-0203-buildchildenv-strip-and-re-inject-contra
---
## Context

`buildChildEnv` strips all `CYCLE_*` vars and callers must re-inject via `cycleEnv`. The structural invariant (`refl-0203-buildchildenv-strip-and-re-inject-contra-structural-invariant`) catches static call-site omissions but does not verify that the subprocess actually receives the vars at runtime — a caller could pass `cycleEnv` with the wrong keys or an empty object and still satisfy the invariant.

## Task

Add a unit/integration test (most likely in `tests/engine/child-env.test.ts`) that exercises the re-injection contract end-to-end:

1. Construct a realistic `cycleEnv` containing `CYCLE_ID`, `CYCLE_BASE`, and `CYCLE_TITLE`.
2. Call `buildChildEnv(cycleEnv)` to get the final env map.
3. Assert that `CYCLE_ID` and `CYCLE_BASE` are present and non-empty in the returned env.
4. Assert that any ambient `CYCLE_*` vars NOT in `cycleEnv` are absent (prefix-strip works).

This test should be a pure unit test against `buildChildEnv` — no subprocess spawn needed. The goal is to pin the contract so that removing `cycleEnv` from the `extra` argument in any caller causes a test failure when that caller's test exercises a real agent step.

If `child-env.test.ts` already has coverage for the strip behavior, extend it rather than creating a new file.

## Acceptance criteria

- A test explicitly asserts `CYCLE_ID` and `CYCLE_BASE` survive the `buildChildEnv` round-trip when passed via `extra`.
- A test explicitly asserts ambient `CYCLE_*` vars (injected into `process.env` before the call) are stripped from the result.
- `src/engine/child-env.ts` 100% coverage floor remains satisfied.
- `npm test` passes with no regressions.
