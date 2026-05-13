# SPEC — Cycle 0030: Engine exec-codex.ts provider module

## Objective

Add a `codex` exec-module so `workflows.yml` steps can declare `agent: codex` and run through the OpenAI Codex CLI end-to-end. This is the second provider against the dispatch seam landed in cycle 0029 — it proves the registry handles more than one provider and unblocks the downstream `multi-agent-abstraction-exec-gemini` and `refl-0029-execmodule-promptpath-contract-leaks-on` cycles that need a non-claudecode caller in tree.

## Source Issue

`multi-agent-abstraction-exec-codex` — "Engine: exec-codex.ts provider module"

## Scope

### In Scope

- New `src/engine/exec-codex.ts` implementing `ExecModule` from `src/engine/exec.ts:4-10`, returning `StepResult` from `src/engine/exec-bash.ts:5-10`.
- Register `codex` in the `REGISTRY` map in `src/engine/exec.ts:20-22` so `resolveAgent("codex")` returns the new module.
- Mocked-subprocess unit tests covering happy path, non-zero exit, and `spawn` ENOENT — mirroring `tests/engine/exec-claudecode.test.ts`.

### Out of Scope

- Touching `exec-claudecode.ts` or its tests.
- Changing the `ExecModule` interface (`promptPath` → `prompt: string` is tracked in `refl-0029-execmodule-promptpath-contract-leaks-on`, which `depends_on` this cycle).
- Adding a `codex` step to any default workflow in `src/defaults/workflows.yml`.
- Real `codex` CLI invocation in tests — subprocesses are mocked via a shell stub on PATH, same pattern as the claudecode test.
- Gemini provider, prompt-handoff redesign, structured tool-call request bodies.

## Requirements

- `exec-codex.ts` exports `codexExec: ExecModule`.
- `runStep({ repoRoot, promptPath, env })`:
  - Reads the prompt body from `${repoRoot}/.cycle/${promptPath}` via `readFile(..., "utf8")` — matches the prevailing contract until the reflection refactor lands.
  - Spawns `codex` via `node:child_process.spawn` with array args, `shell: false`, `cwd: repoRoot`, env built through `buildChildEnv(env ?? {})` from `src/engine/child-env.ts`.
  - Writes the prompt body to the child's stdin and closes stdin (per the source issue: "Pass the prompt on stdin").
  - Captures stdout and stderr as utf8-decoded strings.
  - Resolves `{ status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr }`.
  - On a `child.on("error", ...)` event (ENOENT etc.), resolves `{ status: "failed", exitCode: -1, stdout: "", stderr: err.message }` — never rejects.
- `REGISTRY` in `src/engine/exec.ts` includes `codex: codexExec` alongside `claudecode`.
- No use of `exec` / `execSync` / `shell: true` anywhere in the new module (project subprocess discipline, `CLAUDE.md` § Subprocess discipline).

## Acceptance Criteria

- [ ] `src/engine/exec-codex.ts` exists and exports `codexExec: ExecModule`.
- [ ] `resolveAgent("codex")` returns the module; `UnknownAgentError.message` (when thrown for some other name) now lists `codex` in the sorted known-agents list.
- [ ] New unit tests in `tests/engine/exec-codex.test.ts` cover:
  - Happy path: a fake `codex` shell stub on PATH echoes its stdin; the module returns `status: "ok"` and stdout contains the prompt body verbatim. Asserts stdin delivery, not just argv.
  - Non-zero exit path: stub exits 1; module returns `status: "failed"`, `exitCode: 1`, and stderr is captured.
  - Spawn ENOENT: PATH set to a directory with no `codex` binary; module returns `status: "failed"`, `exitCode: -1`, non-empty `stderr`.
- [ ] `tests/engine/exec.test.ts` either asserts `codex` is registered or a new analogous test does — the dispatch table claim "Dispatch table includes `codex`" is covered by automated test, not just inspection.
- [ ] `npm test` passes; `npm run typecheck` passes with no warnings.
- [ ] Coverage thresholds hold against the baseline in `CLAUDE.md` § Coverage policy: line ≥ 95%, branch ≥ 75%, function ≥ 90%. `src/engine/exec-codex.ts` has its own coverage from the new tests; no per-file regression in `src/engine/exec.ts` from the registry edit.
- [ ] No edits to `src/engine/exec-claudecode.ts`, its test, or `src/defaults/workflows.yml`.

## Testing Strategy

- Node's built-in test runner (`node:test`) with `strict` assert, matching the project's existing pattern.
- Shell-stub mocking: `mkdtemp` a bin dir, write a `#!/bin/bash` script named `codex`, `chmod 0o755`, then pass `PATH: ${bin}:${process.env.PATH}` via the `env` arg. Same idiom as `tests/engine/exec-claudecode.test.ts:8-27`.
- Stdin assertion: the happy-path stub reads stdin (`cat`) and echoes it back so the test can assert the prompt body round-tripped through stdin, not through argv.
- ENOENT path: pass `PATH: "/nonexistent"` and assert the `child.on("error", ...)` branch resolves rather than rejects — same shape as `tests/engine/exec-claudecode.test.ts:29-47`.
- No real `codex` binary invoked anywhere; tests run hermetically on a machine without it installed.

## Documentation Updates

- **`CLAUDE.md`**: § Architecture quick reference already names the dispatch table and `resolveAgent`; append `codex` next to `claudecode` in the per-step `agent:` mention. One-line edit.
- **`README.md`**: no user-facing CLI surface change (no new flag, no new workflow). No README edit required this cycle; documenting that operators can now write `agent: codex` in a custom `workflows.yml` is a doc cycle of its own and is out of scope.
- **`docs/ARCHITECTURE.md`**: no edit — the module-level diagram doesn't enumerate providers.

Documentation is part of "done"; for this cycle that means the single line in `CLAUDE.md` and nothing else.

## Dependencies

- `multi-agent-abstraction-exec-interface` (cycle 0029) is already merged — the `ExecModule` interface, `REGISTRY`, `resolveAgent`, and `UnknownAgentError` exist in `src/engine/exec.ts`.
- `src/engine/child-env.ts` `buildChildEnv` is the env builder for the curated PATH inheritance.
- `src/engine/exec-bash.ts` `StepResult` type is the return shape.
- Node ≥ 22.6 for native `--experimental-strip-types` TS execution (per `CLAUDE.md` § Runtime).
- No new npm dependency. No env var contract. No real `codex` CLI on the test host.
