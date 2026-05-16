All context gathered. Writing the research document to stdout now.

# Research: Cycle 0089

## Cycle Context

SPEC asks for two operator-direct edits: (1) add `--dangerously-skip-permissions` as the first spawn arg in `src/engine/exec-claudecode.ts:13`, and (2) add `assert.match(r.stdout, /--dangerously-skip-permissions/)` after the `/SPECCED/` match in `tests/engine/exec-claudecode.test.ts:22`. This is the sixth attempt; prior cycles failed because engine subprocesses are blocked by `settings.local.json` permission overrides and wrote permission-request prose instead of applying the edit.

## Current Codebase State

### Relevant Components

- **Claude subprocess spawner**: `src/engine/exec-claudecode.ts` — exports `claudecodeExec: ExecModule`. The `spawn` call is at line 13: `spawn("claude", ["-p", prompt], { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false })`. `--dangerously-skip-permissions` is **absent** from this array.
- **ExecModule interface**: `src/engine/exec.ts` — defines `ExecModule` type consumed by `claudecodeExec`.
- **Child env builder**: `src/engine/child-env.ts` — `buildChildEnv(env)` prepends the parent Node bin dir to PATH; imported at `exec-claudecode.ts:4`.
- **StepResult type**: `src/engine/exec-bash.ts` — defines `StepResult { status, exitCode, stdout, stderr }` imported at `exec-claudecode.ts:6`.
- **Agent resolver**: `src/engine/exec.ts:resolveAgent(name)` — returns the registered `ExecModule` for `"claudecode"`. Used by the test at line 20.

### Existing Patterns to Follow

- **spawn with array args, no shell**: `exec-claudecode.ts:13` — project convention (CLAUDE.md: "Always `spawn` with array args. Never `exec` / `execSync`. Never `shell: true`").
- **Test stub pattern**: `tests/engine/exec-claudecode.test.ts:17-18` — fake `claude` binary written as a bash script: `#!/bin/bash\necho SPECCED $@\n`. The `$@` echoes all spawn args to stdout, which is what makes `assert.match(r.stdout, /--dangerously-skip-permissions/)` work — the flag will appear in `$@` once added.
- **assert.match for stdout content**: test line 22 already uses `assert.match(r.stdout, /SPECCED/)`.

### Dependencies & Integration Points

- `exec-claudecode.ts` is imported via `resolveAgent("claudecode")` in `exec.ts` and called by `run-cycle.ts` for each workflow step using the `claudecode` agent type.
- The test imports `resolveAgent` from `src/engine/exec.ts:6` — no direct import of `claudecodeExec`.
- `buildChildEnv` at `exec-claudecode.ts:4` is the only other import besides Node builtins.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`), invoked via `npm test` (runs `pretest` → esbuild build first).
- **Test file**: `tests/engine/exec-claudecode.test.ts` — two tests. Test 1 (line 8): happy path with fake binary, captures stdout. Test 2 (line 29): ENOENT path when binary missing.
- **Fake binary approach**: `mkdtemp` + `writeFile` + `chmod 0o755` creates a real executable in a temp dir; PATH is injected via `env` arg to `runStep`. `$@` in the fake script echoes all spawn args — the flag will appear automatically once added to the array.
- **Teardown**: `rm(root/bin, { recursive: true, force: true })` in `finally`.
- **Current coverage of change area**: test 1 already exercises the spawn call at line 13; the new assertion is additive to the existing test body.

## Code References

- `src/engine/exec-claudecode.ts:13` — `spawn("claude", ["-p", prompt], {...})` — target line for inserting `"--dangerously-skip-permissions"` as index 0
- `tests/engine/exec-claudecode.test.ts:22` — `assert.match(r.stdout, /SPECCED/)` — new assertion goes on line 23, immediately after
- `tests/engine/exec-claudecode.test.ts:17` — fake binary script: `echo SPECCED $@` — `$@` ensures all spawn args including the new flag appear in stdout
- `src/engine/exec.ts` — `resolveAgent` + `ExecModule` — no changes needed
- `src/engine/child-env.ts` — `buildChildEnv` — no changes needed

## Open Questions

None. Both edit locations are pinned to exact lines. The fake binary's `$@` echo makes the assertion mechanically correct once the flag is in the spawn array. No new test files, no new imports, no other files touched.
