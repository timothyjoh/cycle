```markdown
# Research: Cycle 0031

## Cycle Context
Add a `gemini` provider to the engine's exec-module registry as a third entry alongside `claudecode` and `codex`. Strictly mirror the shape of `exec-codex.ts` (spawn `gemini` binary, pipe prompt to stdin, map exit code to StepResult). Register under key `gemini` in `REGISTRY` so `resolveAgent("gemini")` succeeds and `UnknownAgentError` lists it. Add `tests/engine/exec-gemini.test.ts` with three mocked-subprocess scenarios (happy path, non-zero exit, ENOENT) plus a registry-presence assertion in `tests/engine/exec.test.ts`. One-line CLAUDE.md update extending the "Registered agents" list. No DRY refactor, no type-union widening, no real Gemini CLI invocation.

## Current Codebase State

### Relevant Components
- ExecModule contract + REGISTRY dispatch — `src/engine/exec.ts:5-30` (interface lines 5-11, `UnknownAgentError` 13-19, `REGISTRY` 21-24, `resolveAgent` 26-30).
- Reference provider to mirror (`codex`) — `src/engine/exec-codex.ts:1-47`. Single default export `codexExec: ExecModule`; spawns `"codex"` with empty argv, `cwd: repoRoot`, env from `buildChildEnv(env ?? {})`, `shell: false`. Reads prompt from `<repoRoot>/.cycle/<promptPath>` as utf8. Accumulates stdout/stderr via `data` listeners; resolves `StepResult` from `close` event (status ok/failed based on `code === 0`). `error` listener resolves with `exitCode: -1` and stderr=error message. Stdin write wrapped in try/catch with a no-op `stdin.on("error", ...)` listener to absorb the ENOENT race.
- StepResult type — `src/engine/exec-bash.ts:5-10` (`{status:"ok"|"failed"; exitCode:number; stdout:string; stderr:string}`).
- Curated PATH builder — `src/engine/child-env.ts:16-27` (`buildChildEnv(extra)` prepends parent Node's bin dir to PATH, then merges process.env with extra).
- Sibling exec test template — `tests/engine/exec-codex.test.ts:1-79`. Three tests, each uses `mkdtemp` for repo root + bin dir, writes fake `codex` shell script with `chmod 0o755`, injects via `env.PATH`. Cleanup in `finally` with `rm({recursive, force})`.
- Registry-presence tests — `tests/engine/exec.test.ts:5-27`. Existing tests for `claudecode`, `codex`, and `UnknownAgentError` listing both names.
- CLAUDE.md architecture line — `CLAUDE.md:34` ends with `Registered agents: claudecode, codex.` (and lists engine source files including `exec-codex` but not the to-be-added `exec-gemini`).

### Existing Patterns to Follow
- **Module skeleton**: `export const <name>Exec: ExecModule = { async runStep({repoRoot, promptPath, env}) { … } }` returning `Promise<StepResult>` — `src/engine/exec-codex.ts:8-47`.
- **Prompt read**: `await readFile(join(repoRoot, ".cycle", promptPath), "utf8")` — `exec-codex.ts:10-11`.
- **Spawn discipline**: `spawn(<binary>, [], { cwd: repoRoot, env: buildChildEnv(env ?? {}), shell: false })` — `exec-codex.ts:13-17`. CLAUDE.md "Subprocess discipline" forbids `exec`/`execSync`/`shell:true`.
- **Stdout/stderr accumulation**: `.on("data", d => { acc += d.toString(); })` — `exec-codex.ts:20-21`.
- **Close handler exit-code mapping**: `status: code === 0 ? "ok" : "failed"`, `exitCode: code ?? -1` — `exec-codex.ts:22-29`.
- **Spawn-error path**: `child.on("error", err => resolve({status:"failed", exitCode:-1, stdout:"", stderr:err.message}))` — `exec-codex.ts:30-37`.
- **ENOENT-race guard**: empty `child.stdin.on("error", () => {})` + try/catch around `child.stdin.write(prompt); child.stdin.end();` — `exec-codex.ts:38-44`.
- **Registry insertion**: alphabetical key order in object literal — `exec.ts:21-24` currently `claudecode, codex`. Adding `gemini` slots after `codex`.
- **`resolveAgent` error message format**: known agents joined alphabetically (`[...known].sort().join(", ")`) — `exec.ts:15`. Adding `gemini` automatically reflects in `UnknownAgentError` message without explicit code change in that constructor.
- **Test file layout**: `node:test` + `node:assert/strict`, three-test file mirroring codex naming (`<provider>: pipes prompt body to stdin, returns stdout` / `non-zero exit surfaces status:failed and captures stderr` / `resolves StepResult{status:failed,exitCode:-1} when <provider> binary missing (spawn ENOENT)`).
- **Fake-binary fixture**: shell script body `#!/bin/bash\ncat\n` for happy, `#!/bin/bash\necho boom >&2\nexit 1\n` for failure, `PATH:"/nonexistent"` for ENOENT — `tests/engine/exec-codex.test.ts:18, 44, 71`.

### Dependencies & Integration Points
- `src/engine/exec.ts` imports each provider module and registers it in `REGISTRY`. Adding gemini requires (a) `import { geminiExec } from "./exec-gemini.ts";` and (b) `gemini: geminiExec` row in the REGISTRY literal — `src/engine/exec.ts:1-3, 21-24`.
- `tests/engine/exec.test.ts` accesses agents only via `resolveAgent` — adding a new registry test is one new `test(...)` block plus extending the `UnknownAgentError` message assertions if desired.
- No callers exist yet for `agent: gemini` in `workflows.yml` (spec marks that out of scope). Workflow dispatch path through `step.agent → resolveAgent → runStep` is the only integration; no other consumer touches the registry.
- CLAUDE.md:34 lists the engine source files plus the "Registered agents" sentence — both halves of that line need an update (`exec-gemini` added to file list and `gemini` added to the agent list).

### Test Infrastructure
- Test framework: `node:test` (Node native test runner, spec reporter) invoked via `npm test`. Auto-builds `dist/cycle.js` via `pretest`. TypeScript sources executed directly under Node 22.6+ `--experimental-strip-types`.
- Test conventions: files under `tests/engine/<name>.test.ts`, one `test(...)` per scenario, `assert.equal`/`assert.match`/`assert.ok` from `node:assert/strict`. Fixtures live in `mkdtemp` tmpdirs and are torn down in `finally`. Fake CLIs written as POSIX shell scripts and `chmod 0o755`.
- Coverage tool: `npm run test:coverage` uses `--experimental-test-coverage` (native). Master baselines per CLAUDE.md: line ≥ 95%, branch ≥ 75%, function ≥ 90%.
- Current coverage of the change area: `exec.ts` and `exec-codex.ts` are exercised by `tests/engine/exec.test.ts` and `tests/engine/exec-codex.test.ts`; the same shape applied to gemini lands the new file at the same coverage level (the empty `child.stdin.on("error", () => {})` listener and the catch block remain known per-file branch gaps from cycle 0030, intentionally accepted because they guard a sync-throw race).

## Code References
- `src/engine/exec.ts:1-3` — current imports (`StepResult`, `claudecodeExec`, `codexExec`); gemini import slots here.
- `src/engine/exec.ts:21-24` — `REGISTRY` literal; gemini key slots here, alphabetically after `codex`.
- `src/engine/exec.ts:13-19` — `UnknownAgentError` constructor (known-agents list pre-sorted).
- `src/engine/exec-codex.ts:8-47` — full reference module to mirror line-for-line, swapping `"codex"` → `"gemini"`.
- `src/engine/exec-bash.ts:5-10` — `StepResult` type imported by every provider.
- `src/engine/child-env.ts:16-27` — `buildChildEnv` (no change; gemini consumes it identically).
- `tests/engine/exec-codex.test.ts:1-79` — reference test file to copy and adapt (binary name + test titles only).
- `tests/engine/exec.test.ts:10-13` — codex registry-presence assertion; gemini-presence assertion slots adjacent. `tests/engine/exec.test.ts:24-26` — `UnknownAgentError` message assertions list `claudecode` and `codex`; adding `gemini` here matches spec acceptance.
- `CLAUDE.md:34` — "Registered agents" sentence and engine source file list to extend.

## Open Questions
- None within the explicit scope. The spec already pre-decided: same module shape as codex, alphabetical registry order, three test scenarios, one-line CLAUDE.md update, no README change. The previously-acknowledged exec-codex per-file branch coverage gap (empty stdin error listener and unreachable catch) will recur in exec-gemini by construction; the plan step should confirm whether the per-file gap is accepted (precedent from cycle 0030 says yes, global baselines hold).
```
