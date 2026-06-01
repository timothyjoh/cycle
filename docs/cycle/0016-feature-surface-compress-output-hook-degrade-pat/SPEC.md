# SPEC — Cycle 0016: Surface compress-output-hook degrade paths to stderr

## Objective
The `cycle compress-output-hook` PreToolUse classifier is fail-open by contract: every degrade path (malformed JSON, missing/non-string command, or any thrown error) returns empty stdout and exit 0 so a hook bug can never block a legitimate claudecode Bash call. But the implementation swallows those degrade paths with zero observable signal. If claude's PreToolUse event schema drifts so `tool_input.command` is never located, compression would silently disable itself for every command with no log line, no warning, and no test-visible symptom — a real regression would be undetectable in production. This cycle adds a one-line stderr diagnostic to the degrade paths so persistent hook failures become visible, while preserving the exit-0 / empty-stdout / never-block fail-open contract exactly.

## Source Issue
`refl-0015-compress-output-hook-fail-open-swallows` — "Surface compress-output-hook degrade paths to stderr instead of silently swallowing"

## Scope

### In Scope
- Extend `runCompressOutputHook` (`src/cli/compress-output-hook.ts`) so its catch path returns a non-empty, human-readable diagnostic string that `src/cli.ts` writes to `process.stderr`, while still returning empty stdout and exit code 0.
- Plumb that diagnostic to actual stderr in the `compress-output-hook` argv branch of `src/cli.ts` (the function stays pure; the CLI performs the write).
- Add tests in `tests/cli/compress-output-hook.test.ts` asserting the degrade paths emit a non-empty stderr diagnostic while still exiting 0 with empty stdout, and that the rewrite (success) path emits no diagnostic.

### Out of Scope
- Any change to the rewrite/classification logic, the allowlist, or `cycle compress-output` itself.
- Promoting hook failures to a structured engine event (`step.warning`, `log.jsonl`) — stderr only, per the issue.
- Changing the exit code or stdout contents of any path (the fail-open contract is fixed).
- Blocking, retrying, or altering tool-call behavior on a hook error.

## Requirements
- The catch path MUST return a non-empty diagnostic (e.g. carrying the prefix `cycle compress-output-hook:` and a short reason) that the CLI writes to `process.stderr`; it MUST continue to return `{ stdout: "", exitCode: 0 }` for the tool-call result.
- `HookResult` gains an optional diagnostic field (e.g. `stderr?: string`); existing fields `stdout` and `exitCode` keep their meaning. The success/rewrite path and the non-error early returns (shell operator, non-allowlisted binary) MUST NOT set the diagnostic — only genuine degrade paths surface a signal, to avoid stderr spam on every normal passthrough.
- The malformed-JSON and missing/non-string-command early returns MAY emit a diagnostic; if they do, it MUST be a distinct, descriptive message. At minimum the `catch` path emits.
- `src/cli.ts` MUST write the diagnostic to `process.stderr` (not stdout) when present, before exiting with `result.exitCode`.
- The `src/cli/compress-output-hook.ts` per-file coverage floor (70%) MUST be maintained.
- **Failure behavior**: This deliverable *is* the failure-surfacing path. On malformed/unparseable input, missing command, schema drift, or any thrown error, the hook degrades to "no rewrite" (empty stdout, exit 0, tool call runs unchanged) AND writes a one-line diagnostic to stderr — the error is surfaced, never silently swallowed, and never escalated into a blocked tool call. A claude PreToolUse hook that exits 0 with stderr surfaces the message without blocking, so the fail-open contract and the visibility requirement are simultaneously satisfied. The stderr write itself must not throw or change the exit code.

## Acceptance Criteria
- [ ] `runCompressOutputHook("{not json", CTX)` returns `exitCode === 0`, `stdout === ""`, and a non-empty diagnostic string (asserted via the returned `HookResult` field).
- [ ] The allowlisted-success path (`"git status"`) returns the rewrite stdout, `exitCode === 0`, and NO diagnostic (the diagnostic field is empty/undefined).
- [ ] At least one early-return degrade path covered by a test asserts the documented behavior: exit 0, empty stdout, and either an emitted diagnostic or an explicitly-asserted absent diagnostic, matching the implemented policy.
- [ ] `src/cli.ts`'s `compress-output-hook` branch writes the diagnostic to `process.stderr` when present and still calls `process.exit(result.exitCode)`.
- [ ] **Failure-path:** for malformed JSON input, the hook produces a non-empty stderr diagnostic while exiting 0 with empty stdout — verified by a passing test.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).

## Testing Strategy
- `node:test` + `node:assert` (the existing harness for `tests/cli/compress-output-hook.test.ts`), driving `runCompressOutputHook` directly with real stdin strings — no mocking of `node:fs`/`child_process`.
- Scenarios: malformed JSON (catch path emits diagnostic); successful rewrite (no diagnostic); missing/non-string command and shell-operator/non-allowlisted passthrough (assert the implemented diagnostic policy explicitly); confirm every case keeps `exitCode === 0` and `stdout === ""` except the documented rewrite path.
- Regression: keep all existing assertions in `tests/cli/compress-output-hook.test.ts` green; the `HookResult` shape change must not break the existing `r.stdout` / `r.exitCode` assertions.
- No UI changes — no E2E tests required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Update the `engine.compress_output` "Fail-open" note in `CLAUDE.md` to state that hook degrade paths now write a one-line stderr diagnostic (still exit 0, never block). No command-table change.
- **docs/ENGINE.md**: Update the `PreToolUse` compression hook section to note that degrade paths surface a stderr diagnostic alongside the existing fail-open behavior.
- **README.md**: No user-facing surface change; no update required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `src/cli/compress-output-hook.ts`, its CLI entry in `src/cli.ts` (the `compress-output-hook` argv branch), and `tests/cli/compress-output-hook.test.ts`.
- No new external services or environment variables.
