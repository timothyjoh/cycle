## Summary

This cycle surfaces the `cycle compress-output-hook` PreToolUse classifier's fail-open degrade paths to stderr instead of swallowing them silently, while preserving the exit-0 / empty-stdout / never-block contract byte-for-byte.

All four PLAN.md tasks are complete:

- **Task 1** (`src/cli/compress-output-hook.ts`, ~28 lines changed): `HookResult` was widened to `{ stdout: string; exitCode: number; stderr?: string }`. The pure `runCompressOutputHook` now returns a one-line, `cycle compress-output-hook:`-prefixed diagnostic on the two genuine degrade paths — the non-string-`tool_input.command` early return (schema-drift signal: `… PreToolUse event has no string tool_input.command (schema drift?) …`) and the bare `catch` (`… could not parse PreToolUse event …`). The non-rewritable passthrough (shell operator / non-allowlisted binary) and the rewrite-success path leave `stderr` undefined, to avoid stderr spam on ordinary traffic. The function stays pure — it returns the diagnostic as data; no I/O is performed inside it. The doc comment was updated to describe the new behavior.
- **Task 2** (`src/cli.ts`, +1 line): the `compress-output-hook` argv branch now writes `result.stderr` to `process.stderr` (with a trailing `"\n"`, matching the triage sibling branch) when present, before `process.exit(result.exitCode)`. stdout (the hook protocol channel) is unchanged; the exit code is still derived solely from `result.exitCode` (always 0) and is never affected by the write. The write is unguarded, matching the three sibling branches (triage/cleanup/compress-output).
- **Task 3** (`tests/cli/compress-output-hook.test.ts`, ~93 lines changed/added): existing assertions on `exitCode`/`stdout` were preserved and extended. New/extended assertions pin the diagnostic policy: malformed JSON and empty stdin emit a `/could not parse/` diagnostic; non-string and missing `command` emit a distinct `/no string tool_input\.command/` diagnostic; rewrite success and both passthrough returns (shell operator, non-allowlisted binary) assert `r.stderr === undefined`; and a dedicated test asserts the catch vs non-string messages are distinct.
- **Task 4** (docs): `CLAUDE.md` `engine.compress_output` "Fail-open" note and `docs/ENGINE.md` PreToolUse compression hook section both updated to state that degrade paths now write a one-line stderr diagnostic (still exit 0, empty stdout, never block; normal passthroughs stay silent). No command-table row added; README untouched (no user-facing surface change).

**Test suite:** `npm test` — **865 tests, 865 pass, 0 fail**. `npm run typecheck` (`tsc --noEmit`) clean, no warnings.

**Coverage:** `npm run test:coverage` → `npm run check:coverage` + `npm run check:invariants` both clean. Per-file floor `src/cli/compress-output-hook.ts` reports **100.00% ≥ 70%** (the new `stderr` branches are all exercised by Task 3 tests). All other per-file floors pass (triage 99.75%, run-cycle 99.67%, compress-filter 100%, etc.), and all structural invariants pass. No per-file regression.

**Failure modes handled this cycle:** This deliverable *is* the failure-surfacing path. The degrade paths — malformed/unparseable input (catch), and a PreToolUse event with no string command (schema drift) — now degrade to "no rewrite" (empty stdout, exit 0, tool call runs unchanged) **and** emit a non-empty stderr diagnostic, so a persistent hook failure is observable instead of silently disabling compression. The fail-open contract is preserved exactly (exit code never derived from the stderr write; the write is unguarded like sibling branches and cannot throw synchronously or change the exit code). The hook remains pure and stateless, so re-spawns for retried Bash tool calls are inherently idempotent. No error is swallowed; no new `catch` was introduced.

**Deviations from PLAN.md:** None. The implementation matched the plan's per-return policy table and message text exactly. (Note: the source, CLI, tests, and `docs/ENGINE.md` were already in their final state on entry — likely from a prior interrupted build pass; this run verified them against the plan and completed the one remaining gap, the `CLAUDE.md` Fail-open note.)

**Deferred work / follow-up:** None. Promoting hook failures to a structured engine event (`step.warning` / `log.jsonl`) was explicitly out of scope per the issue and remains a possible future enhancement.

## Touched Files
- src/cli/compress-output-hook.ts
- src/cli.ts
- tests/cli/compress-output-hook.test.ts
- docs/ENGINE.md
- CLAUDE.md
