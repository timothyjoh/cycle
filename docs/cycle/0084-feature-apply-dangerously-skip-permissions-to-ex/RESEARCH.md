All data gathered. Writing the research document to stdout.

# Research: Cycle 0084

## Cycle Context

Cycle 0084 adds `--dangerously-skip-permissions` as the first argument to the `spawn("claude", ...)` call in `src/engine/exec-claudecode.ts:13`. This single-line change unblocks spawned Claude CLI subprocesses from editing source files — a restriction imposed by `settings.local.json` overriding global Write/Edit permissions that caused four consecutive cycles (0079, 0081, 0082, 0083) to produce artifact-only commits with no `src/` changes.

## Current Codebase State

### Relevant Components

- **`claudecodeExec` module**: the only Claude CLI exec module — `src/engine/exec-claudecode.ts:1-40`
  - `runStep({repoRoot, promptPath, env})` reads the prompt file, spawns `"claude"` with `["-p", prompt]`, streams stdout/stderr, resolves a `StepResult` on close or error
  - Line 13 is the exact spawn call: `const child = spawn("claude", ["-p", prompt], {`
  - `shell: false` is already set (correct; CLAUDE.md requires array args + no shell)
  - `cwd` is `repoRoot`; env is supplied via `buildChildEnv`

- **`ExecModule` interface**: `src/engine/exec.ts:6-12` — `runStep(args: {repoRoot, promptPath, env?}): Promise<StepResult>`. `claudecodeExec` satisfies this interface; the interface itself is unaffected by the change.

- **`resolveAgent`**: `src/engine/exec.ts:28-32` — registry lookup returning the `claudecodeExec` instance for `"claudecode"`. No changes needed here.

- **`buildChildEnv`**: `src/engine/child-env.ts:16-27` — merges extra env, prepends parent Node's bin dir to PATH. Called at `exec-claudecode.ts:15`. Unaffected by the change.

- **`StepResult` type**: defined in `src/engine/exec-bash.ts` (imported by `exec-claudecode.ts:6`). Shape: `{status, exitCode, stdout, stderr}`. Unaffected.

### Existing Patterns to Follow

- **Array args, no shell**: `exec-claudecode.ts:13-16` already uses `spawn(cmd, argsArray, {shell: false, ...})`. The fix prepends a string element to the existing array — no pattern change.
- **Peer exec modules for reference**: `src/engine/exec-codex.ts`, `src/engine/exec-gemini.ts` — same `ExecModule` shape but not touched by this change.

### Dependencies & Integration Points

- `src/engine/run-cycle.ts` calls `resolveAgent("claudecode").runStep(...)` — no changes needed there
- `src/engine/exec.ts` — registry; no changes needed
- `src/engine/child-env.ts` — env builder; no changes needed
- Claude CLI binary must accept `--dangerously-skip-permissions` as a leading positional flag before `-p` — confirmed by SPEC and prior manual testing

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`) with `--experimental-strip-types`; run via `npm test` (invokes `pretest` build first)
- **Test file**: `tests/engine/exec-claudecode.test.ts` — two tests:
  1. `"invokes claude -p with prompt body, captures stdout"` (line 8): creates a fake `claude` bash script that echoes `SPECCED $@`, runs `runStep`, asserts `status === "ok"` and `stdout` matches `/SPECCED/`. The fake binary accepts all args (bash `echo $@`), so adding `--dangerously-skip-permissions` to the spawn args will still echo them and still match `/SPECCED/`. **No test modification needed.**
  2. `"resolves StepResult{status:failed,...} when claude binary missing"` (line 29): tests spawn-ENOENT path; no args change matters here.
- **Gap noted in SPEC (out of scope)**: neither test asserts that `--dangerously-skip-permissions` is present in the args — tracked in `refl-0083-exec-claudecode-test-does-not-assert-dan`.

## Code References

- `src/engine/exec-claudecode.ts:13` — `const child = spawn("claude", ["-p", prompt], {` — the exact line to change
- `src/engine/exec-claudecode.ts:14` — `cwd: repoRoot,`
- `src/engine/exec-claudecode.ts:15` — `env: buildChildEnv(env ?? {}),`
- `src/engine/exec-claudecode.ts:16` — `shell: false,`
- `src/engine/exec.ts:22-26` — `REGISTRY` mapping `"claudecode"` → `claudecodeExec`
- `tests/engine/exec-claudecode.test.ts:17` — fake claude script: `"#!/bin/bash\necho SPECCED $@\n"` (accepts any args, echoes them all)
- `tests/engine/exec-claudecode.test.ts:22` — `assert.match(r.stdout, /SPECCED/)` — only assertion on stdout content

## Open Questions

None. The change is fully bounded: one args-array element prepended at `src/engine/exec-claudecode.ts:13`, tests pass without modification, no interface or type changes required.
