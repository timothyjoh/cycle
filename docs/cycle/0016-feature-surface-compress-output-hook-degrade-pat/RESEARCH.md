# Research: Cycle 0016

## Cycle Context
This cycle makes the `cycle compress-output-hook` PreToolUse classifier surface its fail-open degrade paths to stderr instead of swallowing them silently. Today `runCompressOutputHook` returns `{ stdout: "", exitCode: 0 }` on every degrade path (malformed JSON, missing/non-string command, and the bare `catch`) with zero observable signal, so a systematic failure such as a drift in claude's PreToolUse event schema would silently disable compression for every command. The change extends `HookResult` with an optional diagnostic field, has the pure hook function populate it on genuine degrade paths (at minimum the `catch`), and plumbs that diagnostic to `process.stderr` in the `compress-output-hook` argv branch of `src/cli.ts` — all while preserving the exit-0 / empty-stdout / never-block fail-open contract byte-for-byte. Tests and docs (CLAUDE.md, docs/ENGINE.md) are updated in the same cycle.

## Current Codebase State

### Relevant Components
- Hook function (the change target): `runCompressOutputHook(stdinJson, ctx)` — pure function returning `HookResult` — `src/cli/compress-output-hook.ts:17-40`
- `HookResult` type (`{ stdout: string; exitCode: number }`) — `src/cli/compress-output-hook.ts:3`
- The three degrade paths inside the function:
  - non-string command early return — `src/cli/compress-output-hook.ts:24`
  - non-rewritable command early return (shell operator / non-allowlisted binary) — `src/cli/compress-output-hook.ts:25`
  - bare `catch` (JSON.parse failure or any thrown error) — `src/cli/compress-output-hook.ts:36-39`
- Success/rewrite path (must NOT emit a diagnostic) — `src/cli/compress-output-hook.ts:26-35`
- CLI argv branch that invokes the hook and must write the diagnostic to stderr — `src/cli.ts:96-106`
- Pure classifier/builder helpers consumed by the hook (out of scope to change): `classifyCommand` — `src/engine/compress-filter.ts:95-102`; `buildRewriteCommand` — `src/engine/compress-filter.ts:119-121`
- Existing tests for the hook — `tests/cli/compress-output-hook.test.ts:1-65`

### Existing Patterns to Follow
- **Pure-function + thin-CLI-shell split**: `compress-filter.ts` is documented as "No I/O: every export is a string/object transform"; the CLI handlers "wrap thin I/O around these functions" — `src/engine/compress-filter.ts:1-7`. The SPEC requires the hook stays pure (returns the diagnostic string) and the CLI performs the `process.stderr` write.
- **CLI branches that emit stderr**: sibling branches read a result object and conditionally write `result.stderr` to `process.stderr` before exiting with `result.exitCode`:
  - triage — `src/cli.ts:65-71` (`if (result.stderr) process.stderr.write(result.stderr + "\n");`)
  - cleanup — `src/cli.ts:80-86` (`process.stderr.write(result.stderr + String.fromCharCode(10));`)
  - compress-output — `src/cli.ts:88-94` (`if (result.stderr) process.stderr.write(result.stderr);`)
  These three establish the `{ stdout, stderr, exitCode }` shape and the "write stdout to stdout, stderr to stderr, then `process.exit(result.exitCode)`" convention the hook branch (currently only writes stdout — `src/cli.ts:104-105`) should adopt.
- **Fail-open contract (must be preserved exactly)**: exit code is ALWAYS 0; any parse/classify error degrades to empty stdout so a hook bug can never block a claudecode Bash call — documented in the function doc comment — `src/cli/compress-output-hook.ts:13-16` and `src/cli/compress-output-hook.ts:36-39`.
- **Failure handling today**: every non-success path returns `{ stdout: "", exitCode: 0 }` with no logging, no stderr, no throw. The `catch` deliberately discards the error (`// Fail open: never block a tool call on a hook/parse error.`) — `src/cli/compress-output-hook.ts:36-39`. There are no retries, timeouts, or fallbacks beyond "no rewrite." The CLI branch swallows nothing extra — it simply never writes anything but stdout — `src/cli.ts:104`.
- **Observability today in the change area**: none at the hook level. The hook is a stdout-only protocol surface (`hookSpecificOutput.updatedInput.command` JSON on the rewrite path). Structured engine events (`.cycle/log.jsonl`, e.g. `step.warning`) exist elsewhere but are explicitly OUT OF SCOPE for this cycle per SPEC line 18 — the deliverable is stderr text only. The adjacent settings-write failure path does use a structured event: `step.warning { cycle_id, step, reason: "compress_hook_settings_failed", error }` emitted by run-cycle (docs/ENGINE.md:212) — referenced only as contrast; not part of this change.
- **Idempotency / retry-safety**: the hook is a pure, stateless function with no locks, dedup keys, or persistence. Determinism is guaranteed by the pure `compress-filter.ts` core. There is no state for the diagnostic write to corrupt; the SPEC requires the stderr write itself must not throw or change the exit code.
- **String-construction conventions**: sibling branches use both `+ "\n"` (triage) and `String.fromCharCode(10)` (cleanup) for trailing newlines; `compress-output` writes `result.stderr` verbatim with no added newline — `src/cli.ts:69,84,92`. No single canonical form is enforced.

### Dependencies & Integration Points
- `src/cli/compress-output-hook.ts` imports `classifyCommand`, `buildRewriteCommand` from `../engine/compress-filter.ts` — `src/cli/compress-output-hook.ts:1`. No change to these is in scope.
- `src/cli.ts` dynamically imports `runCompressOutputHook` in the argv branch — `src/cli.ts:97`. It passes `ctx = { execPath: process.execPath, cliPath: process.argv[1] }` and reads stdin into a Buffer — `src/cli.ts:98-103`.
- No new external services, environment variables, or npm dependencies (SPEC §Dependencies).
- The hook is wired into the engine only via the opt-in `engine.compress_output` flag, which causes run-cycle to materialize `.cycle/compress-hook-settings.json` (`buildCompressHookSettings` — `src/engine/compress-filter.ts:129-145`) and pass it as claudecode `--settings`. That wiring is unchanged by this cycle.

### Test Infrastructure
- **Test framework**: `node:test` + `node:assert` (`strict`), run directly via Node's `--experimental-strip-types` (no transpile). Existing file imports `test` from `node:test`, `strict as assert` from `node:assert` — `tests/cli/compress-output-hook.test.ts:1-3`.
- **Test conventions**: tests mirror source path under `tests/` (`tests/cli/compress-output-hook.test.ts` ↔ `src/cli/compress-output-hook.ts`). A module-level `const CTX = { execPath, cliPath }` fixture is reused — `tests/cli/compress-output-hook.test.ts:5`. Tests drive `runCompressOutputHook` directly with real stdin strings; no mocking of `node:fs` / `child_process` (SPEC Testing Strategy).
- **Current coverage of the change area**: the existing suite covers all current behaviors — rewrite success (`tests/cli/compress-output-hook.test.ts:7-15`), shell-operator passthrough (`:17-22`), non-allowlisted binary passthrough (`:24-29`), missing command (`:31-36`), non-string command (`:38-43`), malformed JSON (`:45-49`), empty stdin (`:51-55`), and a loop over `null`/`true`/`[]`/string/number inputs asserting exit 0 + empty stdout (`:57-65`). Every assertion checks `r.exitCode === 0` and `r.stdout === ""` (or the rewrite stdout). These assertions must remain green after `HookResult` gains the optional field.
- **Failure-path test coverage**: yes — the malformed-JSON catch path and the missing/non-string-command early returns are already exercised (`tests/cli/compress-output-hook.test.ts:31-65`); they currently assert only `exitCode`/`stdout`. The new tests must additionally assert the diagnostic field's presence on degrade paths and its absence on the rewrite path.
- **Coverage floor (must be maintained)**: `src/cli/compress-output-hook.ts` per-file floor is **70%**, enforced by `scripts/coverage-gate.mjs` LCOV-driven `FLOORS` table (CLAUDE.md → Coverage policy). Global floors: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%. Coverage must not decrease. Run via `npm run test:coverage` → `npm run check:coverage`.
- **Validation commands**: `npm test` (full suite, auto-builds), `npm run typecheck` (`tsc --noEmit`, no warnings allowed).

## Code References
- `src/cli/compress-output-hook.ts:3` — `HookResult` type definition (gains optional diagnostic field, e.g. `stderr?: string`).
- `src/cli/compress-output-hook.ts:17-40` — `runCompressOutputHook` body: try/parse, two early returns, success path, `catch`.
- `src/cli/compress-output-hook.ts:24` — non-string-command early return (candidate diagnostic per SPEC "MAY emit").
- `src/cli/compress-output-hook.ts:25` — non-rewritable-command early return (success-adjacent passthrough; SPEC says shell-operator / non-allowlisted MUST NOT spam — verify policy against SPEC line 24).
- `src/cli/compress-output-hook.ts:36-39` — `catch` block (MUST emit a diagnostic per SPEC requirements).
- `src/cli.ts:96-106` — argv branch; line 104-105 currently writes only stdout then `process.exit(result.exitCode)` — must add `if (result.stderr) process.stderr.write(...)` before the exit.
- `src/cli.ts:65-94` — triage/cleanup/compress-output branches showing the established `result.stderr → process.stderr` write pattern.
- `tests/cli/compress-output-hook.test.ts:45-49` — existing malformed-JSON test to extend with a diagnostic assertion.
- `tests/cli/compress-output-hook.test.ts:7-15` — existing rewrite-success test to extend with a no-diagnostic assertion.
- `docs/ENGINE.md:207-214` — `PreToolUse` compression hook section; line 211 contains the "Known limitation" note about degrade paths emitting no diagnostic — to be updated.
- `CLAUDE.md` (Workflow defaults → `engine.compress_output` bullet) — the "Fail-open" sentence (`the hook never blocks a tool call … and a settings-write failure emits one step.warning …`) to be amended to note the new one-line stderr diagnostic on degrade paths.
- `scripts/coverage-gate.mjs` — `FLOORS` table holding the 70% floor for `src/cli/compress-output-hook.ts`.

## Open Questions
- **Diagnostic field name**: SPEC suggests `stderr?: string` on `HookResult` (line 24); confirm naming so the CLI write (`if (result.stderr) process.stderr.write(...)`) matches the sibling branches' shape.
- **Which early returns emit**: SPEC mandates only the `catch` path MUST emit; the malformed-JSON and missing/non-string-command returns MAY emit (must be distinct messages if they do), and the shell-operator / non-allowlisted passthrough MUST NOT emit (normal passthrough, avoid stderr spam) — note that the non-string return (`:24`) and the non-rewritable return (`:25`) are distinct returns and the policy differs between them; the planner must decide the exact per-return policy and the test assertions that pin it.
- **Trailing newline convention for the stderr write**: sibling branches differ (`+ "\n"`, `String.fromCharCode(10)`, or verbatim); pick one for the hook branch.
- **Diagnostic message text**: SPEC suggests the prefix `cycle compress-output-hook:` plus a short reason; exact wording/format is unspecified and should be finalized in planning so tests assert a stable substring.
