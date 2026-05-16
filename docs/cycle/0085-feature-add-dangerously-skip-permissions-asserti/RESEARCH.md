# Research: Cycle 0085

## Cycle Context

Cycle 0085 must make two atomic changes: (1) add `--dangerously-skip-permissions` to the `claude` CLI spawn args in `src/engine/exec-claudecode.ts`, and (2) add `assert.match(r.stdout, /--dangerously-skip-permissions/)` to test 1 in `tests/engine/exec-claudecode.test.ts`. The issue traces back to 4 consecutive cycles (0079, 0081, 0082, 0083) that silently dropped the flag because the test never validated its presence. The fake `claude` binary in test 1 echoes all args via `$@`, so the new assertion directly validates the flag was passed at spawn time.

## Current Codebase State

### Relevant Components

- **Spawn call (missing flag)**: `src/engine/exec-claudecode.ts:13` — `spawn("claude", ["-p", prompt], { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false })`. The args array currently contains only `"-p"` and `prompt`. `--dangerously-skip-permissions` is absent.
- **Test 1 assertion gap**: `tests/engine/exec-claudecode.test.ts:22` — `assert.match(r.stdout, /SPECCED/)`. Only one assertion on stdout; no assertion for `--dangerously-skip-permissions`.
- **Test 1 fake binary**: `tests/engine/exec-claudecode.test.ts:17` — `#!/bin/bash\necho SPECCED $@\n`. Echoes literal string `SPECCED` plus all positional args. Because `$@` captures everything passed to `claude`, adding `--dangerously-skip-permissions` to the spawn args will make it appear in stdout automatically — no change to the fake binary needed.
- **Test 2 (unrelated)**: `tests/engine/exec-claudecode.test.ts:29-47` — tests ENOENT path (missing binary). Unaffected by this cycle.
- **ExecModule interface**: `src/engine/exec.ts:6-12` — `runStep({ repoRoot, promptPath, env? })`. No changes needed here.
- **Agent registry**: `src/engine/exec.ts:22-26` — `claudecode` maps to `claudecodeExec`. No changes needed.
- **buildChildEnv**: `src/engine/child-env.ts:16` — merges `extra` into `process.env`, prepending `nodeBinDir` to PATH. Test 1 overrides `PATH` with `${bin}:${process.env.PATH}` so the fake binary is found first. This mechanism is correct and unchanged.

### Existing Patterns to Follow

- **Spawn args array**: `exec-bash.ts:15` uses `spawn("/bin/bash", [abs], { shell: false })` — array args, never string concat. The plan must extend `["-p", prompt]` to `["-p", prompt, "--dangerously-skip-permissions"]` (or insert before `-p`) using array literal style.
- **No shell: true**: All exec modules (`exec-claudecode.ts`, `exec-bash.ts`) use `shell: false` — must remain.
- **Test structure**: Tests use Node native test runner (`node:test`), `strict as assert`, tmpdir setup/teardown in try/finally. New assertion goes inside the existing try block after line 22.
- **assert.match pattern**: `tests/engine/exec-claudecode.test.ts:22` uses `assert.match(r.stdout, /SPECCED/)` — the new assertion follows the same form: `assert.match(r.stdout, /--dangerously-skip-permissions/)`.

### Dependencies & Integration Points

- `src/engine/exec-claudecode.ts` imports `spawn` from `node:child_process`, `readFile` from `node:fs/promises`, `join` from `node:path`, `buildChildEnv` from `./child-env.ts`, and types `ExecModule` / `StepResult`. No new imports needed.
- `tests/engine/exec-claudecode.test.ts` imports `resolveAgent` from `../../src/engine/exec.ts` — test calls `resolveAgent("claudecode").runStep(...)`. The fake binary intercepts the `claude` command via PATH override; the spawn args flow through to `$@` unchanged.
- The test file uses no mocks — it's an integration test against a real subprocess, so the assertion directly validates runtime behavior.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`), spec reporter via `npm test` (runs `pretest` → `npm run build` first).
- **Test file location**: `tests/engine/exec-claudecode.test.ts`
- **Run command**: `npm test` (auto-builds `dist/cycle.js` via `pretest`; uses `--experimental-strip-types` to run TS directly)
- **Coverage**: `npm run test:coverage` enforces line ≥ 95%, branch ≥ 75%, function ≥ 90% globally; `src/engine/triage.ts` has a per-file floor of line ≥ 95%. `exec-claudecode.ts` has no per-file floor currently.
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`) — no warnings allowed.
- **Fake binary approach**: test 1 creates a tmpdir, writes a `#!/bin/bash\necho SPECCED $@\n` script as `claude`, `chmod 0o755`, then passes its directory at the front of PATH. This is the canonical pattern for testing subprocess invocation without a real `claude` binary.

## Code References

- `src/engine/exec-claudecode.ts:13` — `spawn("claude", ["-p", prompt], ...)` — args array to extend
- `src/engine/exec-claudecode.ts:8-40` — full `claudecodeExec.runStep` implementation
- `tests/engine/exec-claudecode.test.ts:8-27` — test 1: fake binary setup, `resolveAgent` call, assertions
- `tests/engine/exec-claudecode.test.ts:17` — fake binary script: `#!/bin/bash\necho SPECCED $@\n`
- `tests/engine/exec-claudecode.test.ts:20` — `resolveAgent("claudecode").runStep(...)` call
- `tests/engine/exec-claudecode.test.ts:22` — existing `assert.match(r.stdout, /SPECCED/)` — new assertion lands after this line
- `tests/engine/exec-claudecode.test.ts:29-47` — test 2: ENOENT path — unaffected
- `src/engine/exec.ts:22-26` — agent registry mapping `claudecode` → `claudecodeExec`
- `src/engine/child-env.ts:16-27` — `buildChildEnv` — PATH prepend logic used by test 1's fake binary override

## Open Questions

- None. Scope is fully bounded: two-line change (one in source, one in test). Both files exist at HEAD with the expected structure. The fake binary already echoes `$@`, so the new assertion will pass as soon as the flag is added to the spawn args.
