Now I have enough to write RESEARCH.md. Output below to stdout.

```markdown
# Research: Cycle 0029

## Cycle Context

SPEC introduces a single `ExecModule` interface and a per-engine dispatch table so the `agent:` field in `workflows.yml` (per-step and per-triage) resolves to a concrete implementation via one well-defined seam. `claudecode` is the sole registered entry initially; `codex`/`gemini` plug in via follow-up cycles. The cycle must (a) define `ExecModule`/`UnknownAgentError`/`resolveAgent` in a new `src/engine/exec.ts`, (b) reshape `exec-claudecode.ts` to conform with no behavior change for the spawn, (c) route the two existing call-sites (`run-cycle.ts` workflow dispatch + `triage.ts` inline spawn + guards) through `resolveAgent`, and (d) surface unknown-agent failure as a normal step-failure or `engine.paused {reason:"all_triage_failed"}` (no silent fallback). No `workflows.yml` schema change, no new provider modules.

## Current Codebase State

### Relevant Components

- **Existing claudecode exec** — single function `execClaudecodeStep(repoRoot, promptPath, env): Promise<StepResult>` reads `<repoRoot>/.cycle/<promptPath>`, spawns `claude -p <prompt>` (array args, `shell: false`), pipes stdout/stderr, resolves with `{status, exitCode, stdout, stderr}` — `src/engine/exec-claudecode.ts:7-29`.
- **StepResult type** — exported from `src/engine/exec-bash.ts:5-10` (`{status: "ok"|"failed", exitCode: number, stdout: string, stderr: string}`). `execBashStep` shares this shape — `src/engine/exec-bash.ts:12-33`.
- **Workflow step dispatch** — branch on literal `step.agent` in `src/engine/run-cycle.ts:67-79`:
  - `"bash"` → `execBashStep`
  - `"claudecode"` → `execClaudecodeStep` (plus artifact write at `:71-73`, reflection ingestion at `:74-76`)
  - else → `throw new Error("unknown agent: …")`
- **Triage subroutine** — `src/engine/triage.ts`:
  - Guard `cfg.triage.agent !== "claudecode"` at `:163-165` (in `runTriage`) and `:262-264` (in `dryRunTriage`). Both `throw new Error("unsupported triage agent: …")`.
  - Inline `runClaudecodeAgent(prompt, _cfg, repoRoot)` at `:704-728` spawns `claude -p <renderedPromptString>` directly — takes already-rendered prompt body, not a promptPath. Returns `TriageAgentResult = {exitCode, stdout, stderr}` (no `status` field) — `src/engine/triage.ts:21`.
  - Pluggable via `TriageDeps.runAgent` injection (`src/engine/triage.ts:23-31`); default is `runClaudecodeAgent`.
- **Curated subprocess env** — `buildChildEnv(extra)` in `src/engine/child-env.ts:16-27` prepends parent Node's bin dir to PATH. Used by both exec modules and the inline triage spawn.
- **Workflow type definitions** — `src/engine/workflow.ts:5-11` types `Step.agent: "claudecode" | "bash"` (literal union, not `string`). `TriageConfig.agent: string` at `:25-29`.
- **CLI entry orchestration** — `src/cli.ts` calls `runTriage(cwd, cfg, log)` at `:91` and again at `:331` (mid-loop when `raw/` non-empty); `runCycle(cwd, …)` at `:272` (resume) and `:364` (normal). `cli.ts` never spawns agents directly; routing is fully encapsulated inside `triage.ts` and `run-cycle.ts`.

### Existing Patterns to Follow

- **Module-level export + named function** mirrors the existing `execBashStep` / `execClaudecodeStep` style — `src/engine/exec-bash.ts:12`, `src/engine/exec-claudecode.ts:7`.
- **Subprocess discipline** — `spawn(cmd, [args], {cwd, env: buildChildEnv(env), shell: false})` is the canonical shape; never `exec`/`shell:true` (CLAUDE.md § Subprocess discipline; mirrored in both exec modules and `runClaudecodeAgent`).
- **Dependency-injection seam in `triage.ts`** — `TriageDeps.runAgent` (`src/engine/triage.ts:23-31`) shows the project's preferred way to make agent invocation pluggable. The new `ExecModule` should sit alongside / above this so triage's `runAgent` can delegate to `resolveAgent(cfg.triage.agent).runStep(...)`.
- **Named Error subclasses** — codebase mostly throws bare `Error` today (e.g. `src/engine/triage.ts:164`, `src/engine/run-cycle.ts:78`); `UnknownAgentError` is a new named subclass per SPEC requirement — no in-repo precedent, but Node-native idiom (`class UnknownAgentError extends Error { name = "UnknownAgentError" }`).
- **Logger emission shape for failures** — `await log.emit("step.end", { cycle_id, step, status, exit_code })` at `src/engine/run-cycle.ts:80`; failures emit `cycle.end {status:"failed", failing_step}` at `:86`. Unknown-agent dispatch must produce a `StepResult` with `status:"failed"` and a captured message so this path proceeds unchanged.
- **engine.paused for triage all-fail** — payload shape `{reason:"all_triage_failed", raw_ids, last_errors:[{raw_id, error}]}` with 2000-char `error` truncation at `src/engine/triage.ts:233-247`. Unknown-agent triage errors must flow through `processRawWithRetry` so they land in `lastErrors[i]` and inherit this truncation.

### Dependencies & Integration Points

- **`src/engine/run-cycle.ts:5,70`** — sole import + call site for `execClaudecodeStep` in `src/`. Must change to `resolveAgent("claudecode").runStep(...)` (or `resolveAgent(step.agent).runStep(...)` per SPEC §Requirements bullet 2).
- **`src/engine/triage.ts:1,710`** — `import { spawn } from "node:child_process"` and the inline `spawn("claude", ["-p", prompt], …)` at `:710` are the triage-side agent invocation. After refactor, `runClaudecodeAgent` either disappears (folded into the ExecModule call) or wraps `resolveAgent(cfg.triage.agent).runStep(...)`. The `cfg.triage.agent !== "claudecode"` guards at `:163-165` and `:262-264` must go.
- **`tests/engine/exec-claudecode.test.ts:6,20`** — imports `execClaudecodeStep` directly. SPEC §Acceptance bullet 7 requires this test still pass after refactor; SPEC §Requirements states `no compatibility shim or legacy execClaudecodeStep re-export — callers move to resolveAgent("claudecode").runStep(...)`, so the test must be updated to call through `resolveAgent("claudecode").runStep({repoRoot, promptPath, env})` or against the exported module instance directly.
- **`tests/engine/triage.test.ts:799-812`** — the existing `"unsupported agent throws clear error"` test asserts `runTriage` rejects with `/unsupported triage agent: codex/`. After the guard removal, this test's expectation changes: codex should now flow through `resolveAgent("codex")` → throw `UnknownAgentError` → land as triage failure → `engine.paused`. The plan must decide: rewrite or delete-and-replace per SPEC §Acceptance bullet 5.
- **`src/defaults/workflows.yml`** — `agent: claudecode` literal everywhere; `agent: bash` for `verify/commit/pr`. No schema change required; SPEC §Acceptance bullet 9 confirms `sync-defaults` is unaffected.
- **`src/engine/reflection.ts`** — not in scope (SPEC §Scope). Parses stdout from a prior step; does not spawn agents.

### Test Infrastructure

- **Framework**: Node's native test runner (`node:test` + `node:assert/strict`). Spec reporter via `npm test` (CLAUDE.md § Commands). `pretest` builds `dist/cycle.js` via esbuild.
- **Layout**: `tests/engine/<module>.test.ts` (one per src/engine/ file); coverage gates run via `npm run test:coverage` (line ≥95%, branch ≥75%, function ≥90% per CLAUDE.md § Coverage policy).
- **Mocking style**: PATH-stubbed fake binaries on disk (e.g. `tests/engine/exec-claudecode.test.ts:14-20` writes a shell script named `claude` to a tmp dir and prepends it to PATH). Triage tests use dependency injection (`TriageDeps.runAgent`) — `tests/engine/triage.test.ts:133-139` and many siblings.
- **Log capture pattern**: `runCycle` tests scan `.cycle/log.jsonl` with regex (`tests/engine/run-cycle.test.ts:68-72`); `triage` tests use an in-memory `Logger` that appends `Captured` events (`tests/engine/triage.test.ts:37-47`). Both are available patterns for the new acceptance tests.
- **Coverage of change area today**: `exec-claudecode.ts` has 1 test (happy path), `run-cycle.ts` has 10+ tests across `run-cycle.test.ts` + `run-cycle.reflection.test.ts`, `triage.ts` has ~25 tests across `triage.test.ts` + `triage-validator.test.ts` + `triage-dry-run.test.ts`. The unknown-agent paths added by this cycle expand `run-cycle.ts` and `triage.ts` coverage; the new `tests/engine/exec.test.ts` adds two dispatch unit tests.

## Code References

- `src/engine/exec-claudecode.ts:7-29` — current claudecode exec, target of refactor.
- `src/engine/exec-bash.ts:5-10` — `StepResult` type re-used by `ExecModule.runStep` return.
- `src/engine/exec-bash.ts:12-33` — `execBashStep`; stays as a separate path (`agent: "bash"` is NOT routed through `resolveAgent`).
- `src/engine/run-cycle.ts:5` — import to remove.
- `src/engine/run-cycle.ts:67-79` — step dispatch branch to refactor. `agent: "bash"` keeps direct `execBashStep` call; all others go through `resolveAgent`. The artifact write at `:71-73` and reflection ingestion at `:74-76` happen on `r.status === "ok"`; the refactored block must preserve both. The current `else throw new Error("unknown agent: …")` at `:78` becomes "catch `UnknownAgentError` from dispatch, synthesize a failed `StepResult`, let the existing failure path proceed" per SPEC §Requirements (no engine bypass).
- `src/engine/run-cycle.ts:80-88` — `step.end` + failure handling that the unknown-agent path must reuse.
- `src/engine/triage.ts:1` — `spawn` import that may become unused after refactor.
- `src/engine/triage.ts:21-31` — `TriageAgentResult` / `TriageAgentRunner` / `TriageDeps` types — current pluggability seam.
- `src/engine/triage.ts:114` — `await ctx.runAgent(renderedPrompt, ctx.cfg.triage, ctx.repoRoot)` — the call to bridge to `ExecModule.runStep`. Shape mismatch: `runAgent` takes a rendered prompt string + `TriageConfig`; `ExecModule.runStep` per SPEC takes `{repoRoot, promptPath, env}` (a file path). Plan must resolve.
- `src/engine/triage.ts:121-125` — `agentResult.exitCode !== 0` check; `StepResult.status` exposes the same information via `status === "failed"`; either field works.
- `src/engine/triage.ts:163-165, 262-264` — guards to delete.
- `src/engine/triage.ts:233-247` — `engine.paused` emission; unknown-agent triage errors must thread through `lastErrors[]` here.
- `src/engine/triage.ts:704-728` — `runClaudecodeAgent` — inline spawn. After refactor either replaced with a one-liner that calls `resolveAgent(cfg.triage.agent).runStep(...)` or removed entirely.
- `src/engine/workflow.ts:5-11` — `Step.agent` literal union (`"claudecode" | "bash"`). SPEC §Out of Scope leaves this `string`-narrow for non-bash. The static type may need to widen to `"bash" | string` (TypeScript trick) or `string` outright to compile after the refactor — narrow point for the plan.
- `tests/engine/exec-claudecode.test.ts:1-27` — single happy-path test; needs call-site update.
- `tests/engine/run-cycle.test.ts:30-77` — workflow YAML helper + happy-path test; extend with one unknown-agent case per SPEC §Acceptance bullet 4.
- `tests/engine/triage.test.ts:799-812` — current `"unsupported agent"` test; rewrite per SPEC §Acceptance bullet 5.
- `src/cli.ts:91,272,331,364` — orchestration call sites; not modified, but verify no inadvertent ripple.

## Open Questions

1. **`ExecModule.runStep` signature for triage.** SPEC fixes the signature at `({repoRoot, promptPath, env}) -> Promise<StepResult>` "mirrors the existing `execClaudecodeStep` signature." But the inline triage spawn passes the already-rendered prompt string (not a file path) directly to `claude -p`. Three options for the plan: (a) materialize the rendered prompt to a tmp file (e.g. `.cycle/prompts/.triage.tmp.<hash>.md`) before each `runStep` call; (b) widen the interface to accept either `promptPath` or inline `prompt`; (c) change triage to render-via-file (write rendered prompt into a per-run tmp path under `.cycle/`, pass that path). Option (a) keeps the SPEC's signature literally; option (b) deviates from the SPEC's stated single-signature constraint; option (c) is the cleanest but a bigger triage internal change. **Plan should pick and justify.**
2. **Static type of `Step.agent`.** Currently `"claudecode" | "bash"` (literal union — `src/engine/workflow.ts:7`). After refactor, run-cycle's dispatch passes `step.agent` to `resolveAgent` for any non-bash value. SPEC §Out of Scope says don't widen the static type, but `resolveAgent(step.agent)` will fail TypeScript with the current literal union unless either (a) it's narrowed to `string` via a cast at the call site, (b) widened in `workflow.ts` to `"bash" | string`, or (c) widened to `string`. **Plan should pick the narrowest change.**
3. **`runClaudecodeAgent` removal vs adapter.** `runAgent` (the `TriageDeps` seam) is the project's existing way to inject fake agents in triage tests. If the default `runAgent` becomes `(prompt, _cfg, repoRoot) => resolveAgent(_cfg.agent).runStep({…})`, the existing 20+ `TriageDeps.runAgent` test injection points keep working without change. **Plan should confirm this is the chosen adapter shape**, vs. tearing out `TriageDeps`/`runAgent` and forcing every triage test to reach into the dispatch table.
4. **Shape mismatch: `TriageAgentResult` vs `StepResult`.** `TriageAgentResult = {exitCode, stdout, stderr}` (`src/engine/triage.ts:21`) lacks the `status: "ok"|"failed"` field that `StepResult` has. Triage's call-site uses `exitCode !== 0` which works against either shape. **Plan should pick: keep `TriageAgentResult` and unwrap `StepResult` in the adapter, or replace `TriageAgentResult` with `StepResult` throughout.**
5. **Error semantics: reject vs resolve-with-failed.** Current `runClaudecodeAgent` rejects on `child.on("error", …)` (`src/engine/triage.ts:726`); `execClaudecodeStep` never registers an `'error'` handler and never rejects. After refactor through `ExecModule.runStep`, triage will no longer see process-spawn errors as rejections — they'd surface as `close` with `code: null` → `exitCode: -1` → `status: "failed"`. The `try/catch` at `src/engine/triage.ts:113-119` (`agent failed: ${(e as Error).message}`) becomes dead code unless `ExecModule.runStep` is also extended to reject on spawn error. **Plan should resolve: extend the new module to reject on `'error'`, or accept the semantic shift and document it.**
6. **`tests/engine/triage.test.ts:799-812` rewrite.** Existing test asserts the rejection path that this cycle removes. SPEC §Acceptance bullet 5 specifies the replacement test (`cfg.triage.agent = "foo"` → `engine.paused {reason:"all_triage_failed"}` with `last_errors[].error` containing `"foo"` and `"claudecode"`). **Plan should explicitly mark the old test for deletion and the new test for addition** so the diff is unambiguous.
```

Research written. Cycle 0029 surveys all touch points: `exec-claudecode.ts`/`exec-bash.ts` for the `StepResult` contract, `run-cycle.ts:67-79` for workflow dispatch, `triage.ts` (two guards + inline `spawn` at `:710` + `TriageDeps.runAgent` seam), `workflow.ts:5-11` for `Step.agent`'s literal-union type that will fight a string-keyed dispatch, and the three test files needing updates. Six open questions flagged for plan to resolve — the most consequential being signature/shape mismatch between `ExecModule.runStep({promptPath})` and triage's already-rendered prompt string.
