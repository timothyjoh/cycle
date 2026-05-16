Enough data. Writing RESEARCH.md now.

```markdown
# Research: Cycle 0083

## Cycle Context

SPEC.md asks for a single targeted fix: add `--dangerously-skip-permissions` to the `claude` CLI args array in `src/engine/exec-claudecode.ts`, positioning it before the `-p` flag. The fix unblocks all future feature-cycle build steps that have been silently failing because `settings.local.json` overrides (not merges with) global write permissions, causing non-interactive subprocesses to stall on approval prompts.

## Current Codebase State

### Relevant Components

- **`claudecodeExec`**: the single spawn site for `claude -p` — `src/engine/exec-claudecode.ts:13`
  ```ts
  const child = spawn("claude", ["-p", prompt], {
    cwd: repoRoot,
    env: buildChildEnv(env ?? {}),
    shell: false,
  });
  ```
- **`resolveAgent`**: registry mapping `"claudecode"` → `claudecodeExec` — `src/engine/exec.ts:22-26`
- **`ExecModule` interface**: `runStep({ repoRoot, promptPath, env? })` → `Promise<StepResult>` — `src/engine/exec.ts:6-12`
- **`StepResult` type**: `{ status: "ok"|"failed", exitCode: number, stdout: string, stderr: string }` — `src/engine/exec-bash.ts:5-10`
- **`buildChildEnv`**: curates subprocess PATH (prepends parent Node bin dir); `env` arg is the override map — `src/engine/child-env.ts`

### Existing Patterns to Follow

- **Array args, `shell: false`**: Every exec module (`exec-bash.ts:15-16`, `exec-claudecode.ts:13-16`, `exec-codex.ts`, `exec-gemini.ts`) uses `spawn` with an explicit string array and `shell: false`. The new flag must be added as a string element in the array, never via shell interpolation.
- **Flag ordering convention**: The `claude` CLI expects flags before positional args. Current shape: `["-p", prompt]`. New shape: `["--dangerously-skip-permissions", "-p", prompt]`.

### Dependencies & Integration Points

- `exec.ts` imports `claudecodeExec` from `exec-claudecode.ts` and re-exports it via `resolveAgent("claudecode")` — `src/engine/exec.ts:2`
- `run-cycle.ts` calls `resolveAgent(step.agent).runStep(...)` — no direct reference to exec-claudecode.ts; change is transparent to run-cycle.ts
- No other file imports `exec-claudecode.ts` directly (verified: only `exec.ts` imports it)

### Test Infrastructure

- **Framework**: Node native test runner (`node:test` + `node:assert`), invoked via `npm test` (pretest auto-builds `dist/cycle.js`)
- **Test file for this module**: `tests/engine/exec-claudecode.test.ts` — 2 tests
  - Test 1 (`"invokes claude -p with prompt body, captures stdout"`, line 8): creates a fake `claude` binary (`#!/bin/bash\necho SPECCED $@\n`), calls `resolveAgent("claudecode").runStep(...)`, asserts `r.status === "ok"` and `r.stdout` matches `/SPECCED/`. **Does NOT assert on the exact args array** — adding `--dangerously-skip-permissions` will not break this test (it echoes all args, but the assertion only checks for `SPECCED`).
  - Test 2 (`"resolves StepResult{status:failed,exitCode:-1} when claude binary missing"`, line 29): tests ENOENT path with `PATH: "/nonexistent"`. No args involved; unaffected.
- **run-cycle.test.ts**: All 30+ tests use a fake `claude` binary (`#!/bin/bash\nyes FAKED | head -50\n` or similar). Assertions check log event shapes (`step.start`, `step.end`, `cycle.end`) — **zero assertions on the exact CLI args passed to `claude`**. No updates needed.
- **Other test files** referencing `claudecode`: workflow YAML config strings (`agent: claudecode`), log event shape (`"agent":"claudecode"`). None assert on subprocess args.

## Code References

- `src/engine/exec-claudecode.ts:1-40` — Full file; only file to modify
- `src/engine/exec-claudecode.ts:13` — `spawn("claude", ["-p", prompt], ...)` — the single change site
- `src/engine/exec.ts:22-26` — agent registry; `claudecode` maps to `claudecodeExec`
- `src/engine/exec-bash.ts:5-10` — `StepResult` type definition
- `src/engine/child-env.ts` — `buildChildEnv` (no changes needed)
- `tests/engine/exec-claudecode.test.ts:8-27` — Test 1; fake binary echoes `$@` but assertion is `/SPECCED/` only
- `tests/engine/exec-claudecode.test.ts:29-47` — Test 2; ENOENT path, no args assertion
- `tests/engine/run-cycle.test.ts:55-57` — Fake `claude` binary pattern used across all run-cycle tests

## Open Questions

None. The change is unambiguous: one args array in one file. Test suite coverage confirms no test asserts on the exact args shape, so no test updates are required. The planner can proceed directly to the implementation task.
```
