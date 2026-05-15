I have all the information needed. Writing the research document now.

```markdown
# Research: Cycle 0080

## Cycle Context

Cycle 0080 adds an empty-diff post-condition guard to the `build` and `fix` steps in `src/engine/run-cycle.ts`. When a non-bash agent on a branch-based workflow exits 0 but produces no `git diff HEAD` output, the step is flipped to `failed` with a descriptive stderr before `step.end` emits. The guard pattern and export naming mirror the existing `SPEC_MIN_BYTES` / `formatSpecGuardError` guard for the `spec` step. Only `src/engine/run-cycle.ts` and a new test file are touched.

---

## Current Codebase State

### Relevant Components

- **Main implementation target** — `src/engine/run-cycle.ts` (265 lines). Contains the `runCycle` async function, all exported constants/helpers, and the step-dispatch loop. All guard logic in scope of this cycle lives here.
- **Artifact-write seam** — `src/engine/run-cycle.ts:194–209`. Inside the non-bash agent branch, after `resolveAgent` / `mod.runStep`, when `r.status === "ok"`. `sanitizeArtifactStdout(r.stdout)` is applied, written to `<artifactDir>/<STEP>.md`, and then the spec-specific guard fires if `step.name === "spec"`.
- **Existing `SPEC_MIN_BYTES` guard** — `src/engine/run-cycle.ts:198–205`. Guard fires after `writeFile`; sets `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = formatSpecGuardError(...)`. This is the exact pattern the empty-diff guard must follow.
- **Exported constants and helpers** — `src/engine/run-cycle.ts:46–54`:
  - `SPEC_MIN_BYTES = 200` (exported const)
  - `MAX_STEP_END_STDERR = 2000` (exported const)
  - `truncateStepEndStderr(s: string): string` (exported)
  - `formatSpecGuardError(path, bytes, threshold): string` (exported)
- **Internal step sets** — `src/engine/run-cycle.ts:23–29`:
  - `RESET_ELIGIBLE_STEPS = new Set(["build", "fix"])` — hard-codes the steps that get pre-step HEAD capture and resume-reset behavior. The new `EMPTY_DIFF_GUARD_STEPS` must be named distinctly and kept disjoint from `SKIP_ELIGIBLE_STEPS`.
  - `SKIP_ELIGIBLE_STEPS = new Set(["spec", "research", "plan"])` — hard-codes skip-on-artifact steps.
- **`wf` (Workflow) in scope** — `src/engine/run-cycle.ts:99`. `wf.no_branch?: boolean` is readable throughout `runCycle` and at the guard call site. Guard must check `!wf.no_branch`.
- **`step.agent` in scope** — loop variable, available at the artifact-write seam. Guard must check `step.agent !== "bash"` (the non-bash branch already handles the write seam, so the check is `step.agent !== "bash"`, consistent with the spec's bypass requirement).
- **`spawnSync` import** — **NOT currently imported** in `src/engine/run-cycle.ts`. The file imports from `node:child_process` only implicitly via `execBashStep` (which lives in `exec-bash.ts`). The guard implementation must add `import { spawnSync } from "node:child_process"` to `run-cycle.ts`.
- **`Workflow` type** — `src/engine/workflow.ts:13–19`. `no_branch?: boolean` is already an optional field, typed and available.
- **`StepResult` type** — `src/engine/exec-bash.ts:5–10`. Fields: `status: "ok" | "failed"`, `exitCode: number`, `stdout: string`, `stderr: string`. The guard mutates `r.status` and `r.stderr` directly on the resolved `StepResult`.

### Existing Patterns to Follow

- **Guard insertion pattern** — `src/engine/run-cycle.ts:198–205`: guard fires inside `if (r.status === "ok" && step.name)` block, after `writeFile`, as an `if (step.name === "spec")` branch. The new guard should be an `else if (EMPTY_DIFF_GUARD_STEPS.has(step.name) && !wf.no_branch)` block immediately after.
- **Status mutation** — guard sets `r.status = "failed"`, `r.exitCode = r.exitCode || 1`, `r.stderr = <guard error string>`. Same as the spec guard.
- **`spawnSync` call convention** — tests and branch helpers use `spawnSync("git", [...args], { cwd: repoRoot, encoding: "utf8", shell: false })`. For the guard, `spawnSync("git", ["diff", "HEAD"], { cwd: repoRoot, encoding: "utf8" })` with no `shell` option (defaults to `false`).
- **Empty-check** — guard fires when `spawnSync` stdout is empty string (`stdout.trim() === ""` or `stdout === ""`).
- **Exported helper naming** — `formatSpecGuardError` → new helper should be `formatBuildGuardError(stepName: string): string`.
- **Exported set naming** — `RESET_ELIGIBLE_STEPS` (not exported) → new exported set `EMPTY_DIFF_GUARD_STEPS: ReadonlySet<string>`.
- **Non-bash-only execution** — the guard insertion point is already inside the `else` branch of `if (step.agent === "bash")` (lines 181–210), so any code there is already bash-bypassed. No additional `step.agent !== "bash"` check is needed in the guard itself; however, SPEC requires the exported constant to be the guard's membership test, so the guard reads `EMPTY_DIFF_GUARD_STEPS.has(step.name)` — the bash bypass is structural from the surrounding `if/else`.

### Dependencies & Integration Points

- `src/engine/branch.ts` — uses async `spawn` for all git operations. No `spawnSync` there. The new guard in `run-cycle.ts` is the first place `spawnSync` appears in engine source (as opposed to test helpers).
- `src/engine/sanitize-artifact.ts` — `sanitizeArtifactStdout` is called before `writeFile` at the seam; the guard fires after `writeFile`. No interaction with sanitization.
- `src/engine/exec-bash.ts` — defines `StepResult` type; bash steps bypass the seam entirely (lines 181–183 in run-cycle.ts). Guard does not affect bash paths.
- `src/engine/workflow.ts` — `Workflow.no_branch?: boolean` already typed; no changes needed.
- `src/engine/log.ts` — `log.emit("step.end", ...)` at line 211 is where `r.status === "failed"` triggers stderr emission via `truncateStepEndStderr`. Guard sets `r.stderr` before this emit; no changes needed in the emit path.

### Test Infrastructure

- **Test runner**: Node native test runner (`node:test`), spec reporter. Invoked via `npm test` (runs `pretest` which builds `dist/cycle.js` first).
- **Test file naming convention** for run-cycle feature slices: `tests/engine/run-cycle.<feature-slug>.test.ts`. New file: `tests/engine/run-cycle.empty-diff-guard.test.ts`.
- **Test repo setup pattern** (from `run-cycle.spec-guard.test.ts:35–66`):
  1. `mkdtemp` two dirs: `root` (git repo) and `bin` (fake claude binary).
  2. `git init -b main` + user config + `git commit --allow-empty -m "init"`.
  3. Write `.cycle/workflows.yml` (with `workflowYml()` helper), prompt file.
  4. Write fake `claude` executable in `bin/`, `chmod 0o755`.
  5. Run `runCycle(root, { ..., env: { PATH: `${bin}:${process.env.PATH}`, CYCLE_BASE: "main" } })`.
  6. Assert on return value and `log.jsonl` content.
  7. `cleanup()` in finally.
- **`no_branch` workflow variant** — `run-cycle.spec-guard.test.ts:19–33` shows a `workflowYml(stepsBody, { noBranch })` helper with `no_branch: true` line injection. The empty-diff guard test must do the same for the bypass scenario.
- **Non-empty diff test setup** — to produce a non-empty `git diff HEAD`, the fake claude script must modify a tracked file. This requires: (a) initial commit includes at least one tracked file, or (b) the fake claude script stages a new file. Since the initial commit is `--allow-empty` (no tracked files), the test must either seed a tracked file in the initial commit or have the fake claude do `git add` of a new file. Because the fake claude shell script runs in its own process, it can write and stage files in `repoRoot` if `repoRoot` is passed via environment or known through convention. The `CYCLE_BASE` env var is set; `repoRoot` is NOT passed directly to the agent subprocess — the agent is invoked by `execClaudecode` with its own working-directory semantics. The test helper should create a tracked file in the initial commit and have the fake claude overwrite it to produce a diff.
- **Import pattern** in test files: `import { runCycle, SPEC_MIN_BYTES, formatSpecGuardError } from "../../src/engine/run-cycle.ts"`. New test imports: `runCycle`, `EMPTY_DIFF_GUARD_STEPS`, `formatBuildGuardError`.
- **Coverage gate** — `scripts/coverage-gate.mjs` enforces `src/engine/triage.ts ≥ 95%` line coverage; global gates are line ≥ 95%, branch ≥ 75%, function ≥ 90%. New branches in `run-cycle.ts` from the guard will need test coverage on both the `true` and `false` sides.

---

## Code References

- `src/engine/run-cycle.ts:1–22` — imports; `node:child_process` not yet imported; must add `spawnSync`.
- `src/engine/run-cycle.ts:23–29` — `RESET_ELIGIBLE_STEPS`, `SKIP_ELIGIBLE_STEPS` sets.
- `src/engine/run-cycle.ts:46–54` — exported constants and helpers (`SPEC_MIN_BYTES`, `formatSpecGuardError`, `MAX_STEP_END_STDERR`, `truncateStepEndStderr`).
- `src/engine/run-cycle.ts:95–99` — `runCycle` signature; `wf` loaded here and in scope for full function.
- `src/engine/run-cycle.ts:136–154` — skip-eligible gate (pre-guard).
- `src/engine/run-cycle.ts:156–172` — reset-eligible gate; covers `build` and `fix`.
- `src/engine/run-cycle.ts:181–210` — step dispatch; bash branch (181–183), non-bash branch (184–209). Artifact-write seam at 194–197. Spec guard at 198–205. Reflection handler at 207–209.
- `src/engine/run-cycle.ts:211–231` — `log.emit("step.end", ...)` and failure routing.
- `src/engine/workflow.ts:13–19` — `Workflow` type; `no_branch?: boolean` at line 17.
- `src/engine/exec-bash.ts:5–10` — `StepResult` type definition.
- `tests/engine/run-cycle.spec-guard.test.ts:1–216` — canonical pattern for single-step guard tests with both `no_branch` and branch variants.
- `tests/engine/run-cycle.spec-guard.test.ts:19–33` — `workflowYml` helper accepting `noBranch` opt.

---

## Open Questions

1. **`git diff HEAD` invocation in `run-cycle.ts`**: `branch.ts` uses async `spawn` for all git ops. The SPEC prescribes `spawnSync`. The planner should confirm `spawnSync` is acceptable here (it is synchronous and blocks the event loop, but `git diff HEAD` on a feature branch is fast). If async is preferred for consistency, `spawnSync` must be replaced with an awaited `spawn`-based call — but SPEC explicitly says `spawnSync`.

2. **`execClaudecode` working directory**: the test for "non-empty diff" requires the fake claude script to modify a tracked file in `repoRoot`. The exact working directory and environment visible to the fake claude subprocess during tests needs to be confirmed from `src/engine/exec-claudecode.ts` so the test helper script can correctly locate and modify the repo file.

3. **Guard position relative to `RESET_ELIGIBLE_STEPS`**: `RESET_ELIGIBLE_STEPS` = `{build, fix}` and the new `EMPTY_DIFF_GUARD_STEPS` = `{build, fix}` are the same set members. The planner should decide whether to reuse `RESET_ELIGIBLE_STEPS` for the guard check (simpler) or keep `EMPTY_DIFF_GUARD_STEPS` separate as SPEC requires (for independent evolution of the two sets).
```
