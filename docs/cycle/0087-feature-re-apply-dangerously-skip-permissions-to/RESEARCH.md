# Research: Cycle 0087

## Cycle Context

Cycle 0087 is the ninth attempt to land a two-line fix: add `"--dangerously-skip-permissions"` as the first arg in the `spawn("claude", ...)` call in `src/engine/exec-claudecode.ts:13`, and add a corresponding `assert.match` assertion in `tests/engine/exec-claudecode.test.ts:22` to pin its presence. All prior cycles (0079, 0081–0086) failed to apply the change because the cycle engine's subprocess is itself blocked by `settings.local.json` permission overrides — a bootstrapping catch-22. Cycle 0086 drained as `status:ok` despite the flag remaining absent. This cycle requires operator-direct application (parent Claude Code session, not an engine subprocess).

## Current Codebase State

### Relevant Components

- **Spawn call (change target)**: `src/engine/exec-claudecode.ts:13` — `spawn("claude", ["-p", prompt], {` — missing `"--dangerously-skip-permissions"` as first arg. The args array currently has two elements: `"-p"` and `prompt`.
- **Test assertion gap**: `tests/engine/exec-claudecode.test.ts:22` — after `assert.match(r.stdout, /SPECCED/)`, no assertion verifies `--dangerously-skip-permissions` appears in the fake-claude's captured stdout.
- **Exec module**: `src/engine/exec-claudecode.ts` — exports `claudecodeExec: ExecModule`. `runStep` reads the prompt file, spawns `claude` with `shell: false`, collects stdout/stderr via stream events, resolves `StepResult` on `close`. No shell interpolation; args are passed as an array.
- **Agent registry**: `src/engine/exec.ts:22-26` — `REGISTRY` maps `"claudecode"` → `claudecodeExec`. `resolveAgent("claudecode")` is the call path used both by the engine and directly in tests.
- **Child env builder**: `src/engine/child-env.ts:16-27` — `buildChildEnv(extra)` prepends the parent Node's bin dir to PATH, merges `process.env`, then applies `extra`. In tests, callers pass `{ PATH: \`${bin}:${process.env.PATH}\` }` to inject the fake `claude` binary ahead of any real one.

### Existing Patterns to Follow

- **Fake-binary test pattern**: `tests/engine/exec-claudecode.test.ts:8-27` — test creates a temp dir, writes a `#!/bin/bash\necho SPECCED $@\n` script as `claude`, `chmod 0o755`s it, passes its parent dir as `PATH` prefix to `runStep`. The fake binary echoes all its args (`$@`) to stdout, making flag assertions straightforward: `assert.match(r.stdout, /--dangerously-skip-permissions/)`.
- **Array-args spawn convention**: `src/engine/exec-claudecode.ts:13`, enforced in `CLAUDE.md` under "Subprocess discipline" — always spawn with array args, `shell: false`. Never `exec`/`shell: true`.
- **assert.match pattern**: `tests/engine/exec-claudecode.test.ts:22` — existing assertion uses `assert.match(r.stdout, /SPECCED/)`. New assertion follows identical shape: `assert.match(r.stdout, /--dangerously-skip-permissions/)`.

### Dependencies & Integration Points

- `src/engine/exec.ts` — imports and re-exports `claudecodeExec`; no changes needed here.
- `src/engine/child-env.ts` — unchanged; PATH injection in tests already routes to the fake binary.
- `tests/engine/exec-claudecode.test.ts` — test 1 ("invokes claude -p with prompt body") is the correct location for the new assertion; the fake binary echoes `$@`, so all spawned args appear in `r.stdout`.

### Test Infrastructure

- **Framework**: Node native test runner (`node:test`, `node:assert`), run via `npm test`. No Jest, no Vitest.
- **Fake binary mechanism**: temp-dir `claude` script that echoes args — allows assertion against exact CLI flags passed to spawn.
- **Test file**: `tests/engine/exec-claudecode.test.ts` — two tests. Test 1 covers successful invocation; test 2 covers ENOENT when binary is missing.
- **Coverage**: `npm run test:coverage` → LCOV at `.cycle/coverage.lcov`. Per-file floor: `src/engine/triage.ts ≥ 95%` (enforced by `scripts/coverage-gate.mjs`). No per-file floor configured for `exec-claudecode.ts`, but global floors apply (line ≥ 95%, branch ≥ 75%, function ≥ 90%).

## Code References

- `src/engine/exec-claudecode.ts:13` — spawn call: `spawn("claude", ["-p", prompt], {` — insert `"--dangerously-skip-permissions"` before `"-p"`.
- `src/engine/exec-claudecode.ts:8-40` — full `claudecodeExec` module; no other args construction paths.
- `tests/engine/exec-claudecode.test.ts:17` — fake binary definition: `echo SPECCED $@` — `$@` expands all positional args, so `--dangerously-skip-permissions` will appear in stdout.
- `tests/engine/exec-claudecode.test.ts:22` — line immediately after the existing `/SPECCED/` assertion; new assertion inserts here.
- `src/engine/exec.ts:22-26` — agent registry; `claudecodeExec` is the only claudecode entry point.
- `src/engine/child-env.ts:16-27` — `buildChildEnv`; tests override PATH to inject fake binary.

## Open Questions

None. Both change locations are unambiguous, the fake-binary test pattern already captures `$@`, and the issue file specifies exact before/after for both changes. Verification command (`grep -n 'dangerously-skip-permissions' src/engine/exec-claudecode.ts` + `npm test`) is pre-specified in the issue.
