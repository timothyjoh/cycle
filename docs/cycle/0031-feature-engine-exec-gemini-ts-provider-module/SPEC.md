```markdown
# SPEC — Cycle 0031: Engine: exec-gemini.ts provider module

## Objective
Add a `gemini` provider to the engine's exec-module registry so workflow steps can declare `agent: gemini` and dispatch to a real Gemini CLI subprocess. Mirrors the shape established by `exec-codex.ts` (stdin-piped prompt, captured stdout/stderr, exit-code-to-status mapping) so the multi-agent abstraction grows by one symmetric provider rather than by per-provider special cases.

## Source Issue
`multi-agent-abstraction-exec-gemini` — "Engine: exec-gemini.ts provider module"

## Scope

### In Scope
- New `src/engine/exec-gemini.ts` exporting `geminiExec: ExecModule` that spawns the `gemini` binary with array args, pipes the prompt body to stdin, and resolves a `StepResult` on close.
- Register `geminiExec` in the `REGISTRY` table in `src/engine/exec.ts` under the key `gemini` so `resolveAgent("gemini")` returns it and `UnknownAgentError` lists it among known agents.
- Mocked-subprocess tests in `tests/engine/exec-gemini.test.ts` covering stdin happy path, non-zero exit / stderr capture, and ENOENT spawn failure; one-line registry-presence assertion added to `tests/engine/exec.test.ts`.

### Out of Scope
- Real Gemini API/CLI invocation — tests use a fake `gemini` shell script on `PATH`, identical to the codex test pattern.
- Per-provider quirks (rate limiting, auth flag plumbing, model selection). Parity-with-codex only.
- Changes to `exec-claudecode.ts` or `exec-codex.ts`.
- Changes to `workflows.yml` to actually start using `agent: gemini` in shipped steps — that is downstream of this module's existence.
- Widening `step.agent` type union (tracked separately as `refl-0030-step-agent-narrow-union-decays-as-regist-widen-step-agent-type`).
- DRY-ing the three provider modules (tracked separately as `refl-0030-exec-provider-modules-converging-on-copy`).

## Requirements
- `geminiExec.runStep({ repoRoot, promptPath, env })` reads `<repoRoot>/.cycle/<promptPath>` as UTF-8 and writes the body to the child's stdin, then calls `stdin.end()`.
- Subprocess is launched with `spawn("gemini", [], { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false })`. No `exec`, no `shell: true`. PATH curated via `buildChildEnv` from `src/engine/child-env.ts`.
- Resolves `{ status: "ok", exitCode: 0, stdout, stderr }` on clean exit; `{ status: "failed", exitCode: <code>, stdout, stderr }` on non-zero exit.
- On spawn error (ENOENT etc.) resolves `{ status: "failed", exitCode: -1, stdout: "", stderr: <error message> }` — never rejects.
- Stdin-error listener and try/catch around `stdin.write` mirror `exec-codex.ts` so the ENOENT race resolves through `child.on("error")` instead of throwing.
- `REGISTRY` in `src/engine/exec.ts` gains a `gemini: geminiExec` entry; key ordering preserved alphabetically next to `codex`.

## Acceptance Criteria
- [ ] `src/engine/exec-gemini.ts` exists, exports `geminiExec: ExecModule`, and matches the codex module's structure.
- [ ] `resolveAgent("gemini")` returns the module; `UnknownAgentError` message includes `gemini` in its known-agents list.
- [ ] `tests/engine/exec-gemini.test.ts` covers: (a) stdin roundtrip via `cat` fake, (b) non-zero exit with stderr capture, (c) ENOENT spawn error returns `exitCode: -1` with non-empty stderr.
- [ ] `tests/engine/exec.test.ts` asserts `resolveAgent("gemini").runStep` is a function and that `UnknownAgentError` for an unknown name lists `gemini`.
- [ ] `npm test` passes — all existing tests still green, no regressions.
- [ ] `npm run typecheck` passes with zero warnings.
- [ ] `npm run test:coverage` shows line ≥ 95%, branch ≥ 75%, function ≥ 90% (master baseline holds).

## Testing Strategy
- Node native test runner (`node:test`), spec reporter, same pattern as `tests/engine/exec-codex.test.ts`.
- Fake `gemini` binary written to a `mkdtemp` bin dir, made executable via `chmod 0o755`, injected through `env.PATH`. No real Gemini CLI required.
- Three scenarios mandatory: happy path (`#!/bin/bash\ncat\n` echoes stdin to stdout), failure path (`#!/bin/bash\necho boom >&2\nexit 1\n`), missing-binary path (`PATH: "/nonexistent"`).
- No E2E / Playwright — pure subprocess unit tests; no UI surface changed.

## Documentation Updates
- **CLAUDE.md**: extend the "Registered agents" sentence under the Architecture quick reference from `claudecode`, `codex` to `claudecode`, `codex`, `gemini`. One-line change.
- **README.md**: no user-facing change — Gemini is not yet referenced in shipped workflows; consumers won't see it until a workflow step opts in.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Depends on (already merged): `multi-agent-abstraction-exec-interface` (cycle 0029) — provides `ExecModule` contract and `REGISTRY` dispatch.
- Sibling-pattern reference (already merged): `multi-agent-abstraction-exec-codex` (cycle 0030) — the template this cycle mirrors.
- No env vars or external services required at build/test time; the real `gemini` CLI is never invoked by tests.
```
