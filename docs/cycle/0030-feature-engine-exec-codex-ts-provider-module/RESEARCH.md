```markdown
# Research: Cycle 0030

## Cycle Context

SPEC.md adds `src/engine/exec-codex.ts` implementing the existing `ExecModule` interface and registers `codex` in the dispatch table at `src/engine/exec.ts:20-22`. The module spawns the `codex` CLI via `node:child_process.spawn` (array args, `shell: false`), writes the prompt body to the child's stdin and closes it (divergence from claudecode, which passes the prompt via argv), captures stdout/stderr, and resolves a `StepResult`. ENOENT and any other `child.on("error", …)` event resolve `{ status: "failed", exitCode: -1 }` instead of rejecting. New unit tests in `tests/engine/exec-codex.test.ts` mirror the claudecode test idioms; one CLAUDE.md line edit is the only doc change.

## Current Codebase State

### Relevant Components

- `ExecModule` interface + `REGISTRY` + `resolveAgent` + `UnknownAgentError` — `src/engine/exec.ts:4-28`. Single-entry registry today: `{ claudecode: claudecodeExec }` at `src/engine/exec.ts:20-22`. `UnknownAgentError` formats the known list via `[...known].sort().join(", ")` (`src/engine/exec.ts:13-14`), so adding `codex` will deterministically appear ahead of `claudecode` in any error message.
- `claudecodeExec` reference impl — `src/engine/exec-claudecode.ts:8-40`. Reads `${repoRoot}/.cycle/${promptPath}` via `readFile(abs, "utf8")` (line 10-11), spawns `claude` with `["-p", prompt]` (line 13), wires `child.stdout.on("data")` / `stderr.on("data")` (lines 20-21), resolves on `close` (lines 22-29), and resolves (does not reject) on `error` (lines 30-37). This is the structural template the SPEC tells the planner to mirror.
- `StepResult` type — `src/engine/exec-bash.ts:5-10`. Shape `{ status: "ok"|"failed", exitCode: number, stdout: string, stderr: string }`. Both `exec-claudecode.ts` and the planned `exec-codex.ts` return this.
- `buildChildEnv(extra)` — `src/engine/child-env.ts:16-27`. Honors caller-supplied `PATH` as the base; always prepends the parent Node's bin dir. Caller passes `env: { PATH: \`${bin}:${process.env.PATH}\` }` in tests, and `buildChildEnv` keeps that intact under nodeBinDir.
- Dispatcher consumption — `src/engine/run-cycle.ts:67-86`. Bash steps short-circuit; everything else calls `resolveAgent(step.agent).runStep({ repoRoot, promptPath: step.prompt!, env: cycleEnv })`. Successful non-bash steps materialize stdout to `${STEP_NAME_UPPER}.md` (`run-cycle.ts:80-82`); the codex module returning the same `StepResult` shape inherits that behavior without further changes.
- Workflow step type — `src/engine/workflow.ts:5-11`. Declares `agent: "claudecode" | "bash"` (narrow union). Adding `codex` to the dispatch table does not, by itself, type-allow `agent: codex` in `workflows.yml`; YAML strings flow into `step.agent` and `resolveAgent` accepts any string. The narrow union in `workflow.ts` is currently a compile-time hint, not a parser-level constraint — no runtime path rejects unknown strings before they hit `resolveAgent`. The SPEC's "Out of Scope" excludes adding `codex` to the default `workflows.yml`, so the type narrowing does not block this cycle, but it is a latent inconsistency the planner should be aware of.
- Triage dispatch — `src/engine/triage.ts:17,707`. Resolves `cfg.agent` from `workflows.yml > triage` via the same `resolveAgent`. Adding `codex` to the registry makes it triage-eligible too (no SPEC requirement; flagged as a side effect).

### Existing Patterns to Follow

- **Subprocess discipline** — `CLAUDE.md` § Subprocess discipline: only `spawn`/`spawnSync` with array args, never `exec`/`execSync`, never `shell: true`. The reference module `exec-claudecode.ts:13-17` complies. `buildChildEnv(env ?? {})` is the only env source for child processes (`src/engine/exec-claudecode.ts:15`, `src/engine/exec-bash.ts:17`).
- **Promise-not-reject error handling** — `src/engine/exec-claudecode.ts:30-37`. `child.on("error", …)` resolves `{ status: "failed", exitCode: -1, stdout: "", stderr: err.message }`. Mirroring this is explicit in the SPEC and required for the ENOENT acceptance test.
- **Stdin delivery (new pattern this cycle)** — no existing engine module pipes a prompt via stdin. Both `exec-claudecode.ts` (argv) and `exec-bash.ts` (script path) pass payload through `args`. The planner is introducing a new sub-pattern: `child.stdin.write(prompt); child.stdin.end();` on the `ChildProcess` returned by `spawn` with the default `stdio: ["pipe","pipe","pipe"]`. Standard Node API; no project precedent to mimic.
- **Shell-stub test idiom** — `tests/engine/exec-claudecode.test.ts:9-22`. `mkdtemp` a `bin/` dir, write `#!/bin/bash\n…` script with `writeFile`, `chmod(fake, 0o755)`, pass `PATH: \`${bin}:${process.env.PATH}\`` via the `env` arg. To prove stdin (not argv) delivered the prompt body, the SPEC requires the happy-path stub be `#!/bin/bash\ncat\n` — i.e., echo stdin to stdout — and the assertion checks `stdout === prompt` (or `match(prompt)`).
- **ENOENT test idiom** — `tests/engine/exec-claudecode.test.ts:29-47`. Pass `PATH: "/nonexistent"`, assert `status: "failed"`, `exitCode: -1`, `stderr.length > 0`. Same shape for codex.
- **Registry assertion idiom** — `tests/engine/exec.test.ts:5-21`. `resolveAgent("claudecode")` returns a module with `runStep: function`; `resolveAgent("foo")` throws `UnknownAgentError` and message includes `"foo"` and `claudecode`. SPEC requires the same assertion extended to `codex`, or an analogous standalone test.
- **Test layout** — Node's built-in `node:test` with `strict` assert (`tests/engine/exec-claudecode.test.ts:1-2`). Setup/teardown via `mkdtemp` + `rm({ recursive: true, force: true })` in `finally`. No external test framework.

### Dependencies & Integration Points

- `src/engine/exec.ts` ← new import `import { codexExec } from "./exec-codex.ts";` (modeled on line 2). Registry literal gains `codex: codexExec` (line 20-22). No other site changes for the dispatch wiring.
- `src/engine/run-cycle.ts:67-86` calls the new module unchanged — it dispatches by `step.agent` string. No edit required.
- `src/engine/triage.ts:707` also unchanged — `codex` becomes triage-eligible by virtue of being in the registry; no SPEC requirement.
- `src/engine/workflow.ts:7` — narrow union `agent: "claudecode" | "bash"` does NOT mention `codex`. SPEC excludes touching the default `workflows.yml`, but a third-party `workflows.yml` using `agent: codex` would parse + dispatch correctly at runtime; the type narrowing is internal-only and the parser does not enforce it. Out of scope per SPEC.
- `src/engine/child-env.ts:buildChildEnv` — direct dependency of the new module's spawn env.
- `src/engine/exec-bash.ts:StepResult` — return-type import.
- No npm dep changes (`package.json:29-32` declares `yaml`, `@types/node`, `esbuild`, `typescript`; nothing new needed).
- Node ≥ 22.6 stays satisfied; `--experimental-strip-types` already in `npm test` (`package.json:15`).

### Test Infrastructure

- **Test framework** — Node native test runner, `--experimental-strip-types --test-reporter=spec` (`package.json:15`). Coverage variant adds `--experimental-test-coverage` plus exclude globs (`package.json:17`).
- **Test layout** — `tests/engine/*.test.ts`, one file per engine module. New file `tests/engine/exec-codex.test.ts` slots into this convention. Existing files: `blocked.test.ts`, `branch.test.ts`, `child-env.test.ts`, `cycle-id.test.ts`, `exec-bash.test.ts`, `exec-claudecode.test.ts`, `exec.test.ts`, `frontmatter.test.ts`, `log-tail.test.ts`, `log.test.ts`, `queue.test.ts`, `reflection.test.ts`, `run-cycle.reflection.test.ts`, `run-cycle.test.ts`, `triage-dry-run.test.ts`, `triage-validator.test.ts`, `triage.test.ts`, `workflow.test.ts`.
- **Mocking approach** — no mocking library; subprocesses are mocked by writing a real shell script onto a temp PATH (`tests/engine/exec-claudecode.test.ts:16-20`). Same approach for codex.
- **Existing exec coverage** — `tests/engine/exec.test.ts` (2 tests) covers `resolveAgent` happy + unknown. `tests/engine/exec-claudecode.test.ts` (2 tests) covers spawn-happy and spawn-ENOENT. `tests/engine/triage.test.ts:1249` has a dispatch-routing test for `claudecode`. No existing test asserts stdin delivery (because no current module uses stdin).
- **Coverage baseline (CLAUDE.md § Coverage policy, 2026-05-13)** — line ≥ 95%, branch ≥ 75%, function ≥ 90%. The new module + tests must hold these. `src/engine/exec.ts`'s coverage already exists; adding `codex: codexExec` to the registry literal is a one-line change that does not introduce new branches.

## Code References

- `src/engine/exec.ts:4-10` — `ExecModule` interface (`runStep` signature: `{ repoRoot, promptPath, env? }` → `Promise<StepResult>`).
- `src/engine/exec.ts:12-18` — `UnknownAgentError` (sorted known-agent list in message).
- `src/engine/exec.ts:20-22` — `REGISTRY` literal; the single registration site for new providers.
- `src/engine/exec.ts:24-28` — `resolveAgent(name)`; throws if not present.
- `src/engine/exec-claudecode.ts:1-40` — full reference module; entire structure (imports, exported `ExecModule` object, `runStep` body, `Promise` wrapper, `close`/`error` handlers) is the template to mirror minus argv-vs-stdin.
- `src/engine/exec-bash.ts:5-10` — `StepResult` type.
- `src/engine/child-env.ts:16-27` — `buildChildEnv`; honors caller `PATH`, always prepends parent Node bin.
- `src/engine/run-cycle.ts:67-86` — dispatcher; stdout of non-bash success → `${stepNameUpper}.md` (line 80-82).
- `src/engine/workflow.ts:5-11` — `Step` type with narrow `agent` union (`"claudecode" | "bash"`).
- `src/engine/triage.ts:17,707` — second consumer of `resolveAgent`; adding codex implicitly allows `triage.agent: codex` in `workflows.yml` (out of scope for this cycle's defaults).
- `tests/engine/exec-claudecode.test.ts:8-27` — happy-path shell-stub idiom.
- `tests/engine/exec-claudecode.test.ts:29-47` — ENOENT idiom.
- `tests/engine/exec.test.ts:5-21` — registry-assertion idiom.
- `src/defaults/workflows.yml:15-24` — feature workflow steps; SPEC explicitly forbids adding a `codex` step here.
- `docs/RFC-001-issue-lifecycle.md:121,416` — RFC already names `codex` as a configurable agent and explicitly marks `exec-codex.ts` as the staged-impl side; no edit required.
- `CLAUDE.md` § Architecture quick reference — current bullet enumerates `exec, exec-bash, exec-claudecode, child-env, workflow, …`; SPEC requires adding `codex` next to `claudecode` in the per-step `agent:` mention (single-line edit).

## Open Questions

- **Step type narrow union** — `src/engine/workflow.ts:7` declares `agent: "claudecode" | "bash"`. The SPEC out-of-scope explicitly excludes editing the default `workflows.yml` but is silent about this type. Runtime parsing (`loadConfig`/`loadWorkflow`) treats YAML strings as `any` and the dispatcher accepts any string, so leaving the union narrow is internally consistent for this cycle. Planner should confirm whether `Step.agent` should widen to `string` (or to `"claudecode" | "codex" | "bash"`) now or remain narrow until a downstream cycle. The acceptance criterion "no edits to … `src/defaults/workflows.yml`" does not cover `src/engine/workflow.ts`, so this is genuinely open.
- **stdin write semantics under spawn-error** — when `spawn` fails synchronously with ENOENT, the returned `ChildProcess` still exposes `child.stdin`, but writing to it after the `error` event has fired may raise EPIPE in some Node versions. Planner should decide whether to call `child.stdin.write(...).end()` before or after attaching the `error` listener, and whether to wrap the stdin write in a try/catch or attach an `error` listener on `child.stdin` itself, to ensure the ENOENT acceptance test (`PATH: "/nonexistent"`) consistently resolves `{status:"failed",exitCode:-1}` without an unhandled error event. The claudecode reference does not exercise stdin and provides no precedent.
- **`UnknownAgentError` test update scope** — SPEC acceptance bullet 2 requires `UnknownAgentError.message` (for a name other than codex) to list `codex` in its sorted known-agents list. The existing `tests/engine/exec.test.ts:10-21` asserts `/claudecode/` against the message for `resolveAgent("foo")`. Planner to decide whether to (a) extend that test with an additional `/codex/` match, (b) add a new test, or (c) both. SPEC permits either shape.
- **Whether to add a dispatch-table test** — SPEC acceptance bullet 4 says "either … or" — planner picks the location. The existing `tests/engine/exec.test.ts` is the natural home but `tests/engine/exec-codex.test.ts` can also cover it via a `resolveAgent("codex")` smoke check at the top.
```
