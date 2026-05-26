# SPEC — Cycle 0255: Add isRateLimitError Shared Helper

## Objective
Create a pure utility module `src/engine/rate-limit.ts` that centralizes detection of rate-limit signals from subprocess execution results. Currently every exec module treats rate-limit exits as ordinary failures; this cycle introduces a single, testable helper that future exec modules can call to distinguish transient rate-limit errors from hard failures — enabling accurate backoff and retry decisions.

## Source Issue
`mentor-rate-limit-docs-vs-code-rate-limit-detector` — "Add isRateLimitError shared helper to src/engine/rate-limit.ts"

## Scope

### In Scope
- Create `src/engine/rate-limit.ts` exporting `ExecResult` interface and `isRateLimitError` function
- Create `tests/engine/rate-limit.test.ts` with full coverage of all detection branches

### Out of Scope
- Wiring `isRateLimitError` into any existing exec module (exec-claudecode, exec-codex, etc.)
- Retry or backoff logic using the new helper
- Any changes to the engine supervisor or queue drain loop

## Requirements
- `ExecResult` interface with `exitCode: number | null`, `stderr: string`, `stdout: string`
- `isRateLimitError(result: ExecResult): boolean` must be pure with no side effects
- Detect exit code 429 regardless of stderr/stdout content
- Detect exit code 1 when stderr or stdout contains `"rate limit"`, `"429"`, or `"Too Many Requests"` (case-insensitive match)
- Exit code 0 must never return `true`
- Unrelated stderr on exit code 1 must return `false`

## Acceptance Criteria
- [ ] `src/engine/rate-limit.ts` exists and exports both `ExecResult` and `isRateLimitError`
- [ ] `isRateLimitError({ exitCode: 429, stderr: "", stdout: "" })` returns `true`
- [ ] `isRateLimitError({ exitCode: 1, stderr: "rate limit exceeded", stdout: "" })` returns `true`
- [ ] `isRateLimitError({ exitCode: 1, stderr: "429 error", stdout: "" })` returns `true`
- [ ] `isRateLimitError({ exitCode: 1, stderr: "Too Many Requests", stdout: "" })` returns `true`
- [ ] `isRateLimitError({ exitCode: 1, stderr: "command not found", stdout: "" })` returns `false`
- [ ] `isRateLimitError({ exitCode: 0, stderr: "rate limit", stdout: "" })` returns `false`
- [ ] `isRateLimitError` detects patterns in `stdout` as well as `stderr` for exit code 1
- [ ] `tests/engine/rate-limit.test.ts` covers all cases above
- [ ] `npm run typecheck` passes with no new errors
- [ ] `npm test` passes with all existing tests still green
- [ ] Per-file coverage floor for `src/engine/rate-limit.ts` added to `scripts/coverage-gate.mjs` at 100%

## Testing Strategy
- Node built-in test runner (`node:test`) matching existing test conventions
- Unit tests only — function is pure, no filesystem or subprocess dependency
- Cases: exit 429 (true), exit 1 + stderr pattern match (true for each of 3 patterns), exit 1 + stdout pattern match (true), exit 1 + unrelated stderr (false), exit 0 + matching string (false), null exit code + matching string (false)

## Documentation Updates
- **CLAUDE.md**: Add `src/engine/rate-limit.ts` to the Architecture key-modules list
- **README.md**: No user-facing change required

## Dependencies
- No external dependencies — pure TypeScript using built-in string operations
- `scripts/coverage-gate.mjs` must have a new floor entry for the new file
