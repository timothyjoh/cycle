I have all the context needed. Writing the research document now.

```markdown
# Research: Cycle 0162

## Cycle Context

Cycle 0162 extracts a shared `runAgent` helper into a new `src/engine/exec-spawn.ts` module, then reduces `exec-codex.ts`, `exec-claudecode.ts`, and `exec-gemini.ts` to thin config-plus-delegation wrappers. The two provider modules are ~95% identical today (same imports, same spawn wiring, same close/error/stdout/stderr handling); they differ only in binary name and prompt-delivery channel (stdin vs argv). A third copy (`exec-gemini.ts`) has already landed in the repo — the SPEC's "Out of Scope" framing is stale; all three must be shrunk. No observable behavior changes; only internal structure.

## Current Codebase State

### Relevant Components

- **`exec-codex.ts`** — stdin-delivery exec module. Spawns `codex []`, writes prompt to `child.stdin`, calls `child.stdin.end()`. Error listener `child.stdin.on("error", () => {})` suppresses EPIPE. No `stdio` option (defaults to `["pipe","pipe","pipe"]`). No try/catch around stdin write (removed in cycle 0161). — `src/engine/exec-codex.ts:1-43`
- **`exec-claudecode.ts`** — argv-delivery exec module. Spawns `claude ["--dangerously-skip-permissions", "-p", prompt]`. Sets `stdio: ["ignore", "pipe", "pipe"]` explicitly. No stdin write at all. — `src/engine/exec-claudecode.ts:1-41`
- **`exec-gemini.ts`** — stdin-delivery exec module, identical structure to `exec-codex.ts` EXCEPT it retains the dead try/catch around `stdin.write`/`stdin.end` that cycle 0161 removed from codex. — `src/engine/exec-gemini.ts:1-47`
- **`exec.ts`** — registry + `ExecModule` interface. Imports and registers all three providers. Interface: `runStep({ repoRoot, promptPath, env? }): Promise<StepResult>`. — `src/engine/exec.ts:1-32`
- **`exec-bash.ts`** — defines `StepResult` type and `execBashStep` function. **`StepResult` has no `stderr_excerpt` field** — it is `{ status, exitCode, stdout, stderr }` only. — `src/engine/exec-bash.ts:5-10`
- **`child-env.ts`** — exports `buildChildEnv(extra)`. Prepends parent node's `dirname(process.execPath)` to PATH. — `src/engine/child-env.ts:16-26`
- **`log-fmt.ts`** — exports `truncateHeadCapped(s, max)`. Currently used by `run-cycle.ts` (line 243) and `triage.ts`, but **not** by any exec module. — `src/engine/log-fmt.ts:1-3`
- **`run-cycle.ts`** — calls `resolveAgent(name).runStep(...)`, then applies `truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)` at line 243 for event dispatch. `MAX_STEP_END_STDERR = 2000` defined at line 50. — `src/engine/run-cycle.ts:50,243`

### Existing Patterns to Follow

- **Spawn discipline**: `spawn(binary, argsArray, { cwd, env: buildChildEnv(env ?? {}), shell: false })` — no `exec`, no `execSync`, no `shell: true`. All three exec modules follow this. — `src/engine/exec-codex.ts:13-17`
- **stdout/stderr accumulation**: `let stdout = ""; let stderr = ""; child.stdout.on("data", d => { stdout += d.toString(); }); child.stderr.on("data", d => { stderr += d.toString(); })` — identical across all three modules.
- **close handler resolve pattern**: `child.on("close", code => { resolve({ status: code === 0 ? "ok" : "failed", exitCode: code ?? -1, stdout, stderr }) })` — identical across all three modules. — `src/engine/exec-codex.ts:22-29`
- **error handler resolve pattern**: `child.on("error", err => { resolve({ status: "failed", exitCode: -1, stdout: "", stderr: err.message }) })` — identical across all three modules. — `src/engine/exec-codex.ts:30-37`
- **stdin ENOENT guard**: `child.stdin.on("error", () => {})` suppresses EPIPE class errors before write. Present in codex and gemini (argv path doesn't use stdin). — `src/engine/exec-codex.ts:38`
- **promptPath resolution**: `const abs = join(repoRoot, ".cycle", promptPath); const prompt = await readFile(abs, "utf8")` — identical in all three exec modules. — `src/engine/exec-codex.ts:10-11`
- **ExecModule export shape**: each module exports a named `const xxxExec: ExecModule = { async runStep(...) {...} }`. Registry in `exec.ts` uses these directly. — `src/engine/exec-codex.ts:8`
- **Test pattern** (integration, not unit): each test creates a real tmpdir, writes a fake shell script binary, calls `resolveAgent("name").runStep(...)`, asserts on result. No mocking of `child_process`. — `tests/engine/exec-codex.test.ts:8-33`

### Key Differences Between Providers

| | `exec-codex` | `exec-claudecode` | `exec-gemini` |
|---|---|---|---|
| binary | `codex` | `claude` | `gemini` |
| argv | `[]` | `["--dangerously-skip-permissions", "-p", prompt]` | `[]` |
| stdio option | default (pipe/pipe/pipe) | `["ignore","pipe","pipe"]` | default (pipe/pipe/pipe) |
| prompt delivery | stdin | argv (-p flag) | stdin |
| stdin error guard | yes | n/a | yes |
| try/catch on stdin write | no (removed cycle 0161) | n/a | **YES** (stale — still present) |

### Dependencies & Integration Points

- `exec.ts` imports `codexExec`, `claudecodeExec`, `geminiExec` and puts them in `REGISTRY` — `src/engine/exec.ts:2-4,22-26`
- `run-cycle.ts` calls `resolveAgent(agentName).runStep(...)` then truncates stderr post-hoc — `src/engine/run-cycle.ts:206,243`
- `StepResult` type re-exported via `exec-bash.ts`; both `exec.ts` and all exec modules import from there — `src/engine/exec-bash.ts:5`
- All test files import `resolveAgent` from `exec.ts`, not the provider directly — `tests/engine/exec-codex.test.ts:6`

### Test Infrastructure

- **Framework**: Node's built-in `node:test` runner with `node:assert` strict mode
- **Naming**: `tests/engine/<module>.test.ts`
- **Pattern**: real tmpdir + real fake binaries (shell scripts), no mocking of `child_process`
- **Existing exec tests**:
  - `tests/engine/exec-codex.test.ts` — 3 tests: stdin roundtrip, non-zero exit + stderr, ENOENT
  - `tests/engine/exec-claudecode.test.ts` — 2 tests: argv invocation + stdout, ENOENT
  - `tests/engine/exec-gemini.test.ts` — 3 tests: stdin roundtrip, non-zero exit + stderr, ENOENT
  - `tests/engine/exec.test.ts` — 4 tests: registry resolution for each provider + UnknownAgentError
- **Coverage gate**: `scripts/coverage-gate.mjs`. `exec-spawn.ts` not yet in `FLOORS` table (`src/engine/exec-spawn.ts` absent from FLOORS as of line 12-22). No existing per-file floor for any exec-* module.
- **Aggregate floors**: line ≥ 95%, branch ≥ 75%, function ≥ 90% (CLAUDE.md)

## Code References

- `src/engine/exec-codex.ts:1-43` — stdin-delivery provider; no try/catch (cycle 0161 cleaned)
- `src/engine/exec-claudecode.ts:1-41` — argv-delivery provider; explicit `stdio: ["ignore","pipe","pipe"]`
- `src/engine/exec-gemini.ts:1-47` — stdin-delivery provider; still has stale try/catch at lines 39-44
- `src/engine/exec.ts:6-12` — `ExecModule` interface definition
- `src/engine/exec.ts:22-26` — REGISTRY with claudecode, codex, gemini
- `src/engine/exec-bash.ts:5-10` — `StepResult` type: `{ status, exitCode, stdout, stderr }` — no `stderr_excerpt`
- `src/engine/child-env.ts:16-26` — `buildChildEnv(extra)` implementation
- `src/engine/log-fmt.ts:1-3` — `truncateHeadCapped(s, max)` — not yet used by exec modules
- `src/engine/run-cycle.ts:50` — `MAX_STEP_END_STDERR = 2000`
- `src/engine/run-cycle.ts:243` — stderr truncation applied post-hoc after `runStep` returns
- `scripts/coverage-gate.mjs:12-22` — `FLOORS` table; no entry for `exec-spawn.ts`
- `tests/engine/exec-codex.test.ts:1-79` — 3 integration tests for codex
- `tests/engine/exec-claudecode.test.ts:1-47` — 2 integration tests for claudecode
- `tests/engine/exec-gemini.test.ts:1-79` — 3 integration tests for gemini
- `tests/engine/_helpers/` — helper directory exists (contents not read; planner should check)

## Open Questions

1. **`exec-gemini.ts` scope**: The SPEC lists Gemini provider as "Out of Scope" but `exec-gemini.ts` already exists in the repo with tests. Should the refactor reduce all three providers (codex, claudecode, gemini) to thin wrappers, or skip gemini? The issue description says "Lands before Gemini queue row pops" — but Gemini has already landed. Planner should decide whether gemini is included.

2. **stderr capping in `runAgent` vs post-hoc**: The SPEC requires `runAgent` to "head-cap stderr." Currently NO exec module caps stderr — capping is done by `run-cycle.ts:243`. If `runAgent` caps internally, `StepResult.stderr` will arrive truncated, and `run-cycle.ts:243` double-caps (harmless but redundant). The `StepResult` type has no `stderr_excerpt` field; adding one would change the interface. Planner must decide: cap inside `runAgent` (changing what `run-cycle.ts` receives) or leave capping to the caller as today.

3. **`exec-gemini.ts` stale try/catch**: Lines 39-44 of `exec-gemini.ts` still have the try/catch that cycle 0161 removed from codex. If gemini is included in this refactor, the helper should follow the cycle 0161 pattern (no try/catch). If not included, it remains a separate cleanup task.

4. **`stdio` for stdin path**: `exec-codex.ts` uses default stdio; `exec-claudecode.ts` sets `stdio: ["ignore","pipe","pipe"]` explicitly. For the stdin delivery path in `runAgent`, the planner must confirm whether `stdio` should be omitted (defaulting to pipe/pipe/pipe) or explicitly set to the same.

5. **`tests/_helpers/` contents**: Not read. May contain shared test utilities relevant to the new `exec-spawn.test.ts`.
```
