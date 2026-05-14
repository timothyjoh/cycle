Now I have the full picture. Output research to stdout.

```markdown
# Research: Cycle 0038

## Cycle Context
SPEC.md (`docs/cycle/0038-feature-define-enforce-restart-policy-for-build/SPEC.md`) directs us to implement **Policy 1 (hard reset)** for restart-tolerance of the `build` step: capture the pre-build commit SHA on the `build` `step.start` event payload, and on resume of `build` read the most recent prior `step.start` for `build` in the same cycle, run `git reset --hard <sha>` on the cycle branch (current `cycle/...` HEAD), then emit a fresh `step.start` (with a new `head_sha` equal to the pre-reset SHA) before invoking the agent. Backward-compat: if the prior event lacks `head_sha`, emit `step.warning {reason: "build_pre_sha_missing"}` and skip the reset. Only the `build` step gets this treatment; other agent steps overwrite a single artifact file via `writeFile` and need no policy.

## Current Codebase State

### Relevant Components

- **Engine run-cycle (cycle-level loop)** — `src/engine/run-cycle.ts:32-136`. `runCycle(repoRoot, opts)`:
  - Branch setup gate: `opts.resume` ⇒ `checkoutCycleBranch` (`src/engine/run-cycle.ts:50`); non-resume ⇒ `createCycleBranch` (`src/engine/run-cycle.ts:57`). For `no_branch` workflows, `prepareTrunkArtifactDir` is used in both cases.
  - Step loop: `for (let i = startIdx; i < wf.steps.length; i++)` — `src/engine/run-cycle.ts:71`. Currently emits `step.start` with payload `{cycle_id, step: step.name, agent: step.agent}` at `src/engine/run-cycle.ts:73` for **every** step including the first step of a resume. Agent steps are dispatched via `resolveAgent(step.agent)` at `src/engine/run-cycle.ts:79`; bash steps via `execBashStep` at `src/engine/run-cycle.ts:76`. There is currently no per-step "before agent run" hook other than the `step.start` emit.
  - `step.end` is emitted at `src/engine/run-cycle.ts:95` with `{cycle_id, step, status, exit_code}`. Failed steps return early at `src/engine/run-cycle.ts:101`.
  - Private helper `currentBranch(repoRoot)` (`src/engine/run-cycle.ts:13-21`) uses `spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], {shell:false})` — pattern for the SHA-capture helper.

- **Branch helpers** — `src/engine/branch.ts`:
  - Module-private `git(repoRoot, args)` (`src/engine/branch.ts:5-15`) — wraps `spawn("git", args, {shell:false})`, rejects with captured stderr on non-zero. The canonical place to add `resetCycleBranchTo(sha)`.
  - Module-private `revParse(repoRoot, ref)` (`src/engine/branch.ts:64-72`) — returns trimmed stdout on success, `null` on failure. Already returns a string SHA, perfect template for "capture `HEAD`".
  - `createCycleBranch` (`src/engine/branch.ts:28-39`), `checkoutCycleBranch` (`src/engine/branch.ts:41-47`), `checkoutBase` (`src/engine/branch.ts:49-51`), `pullBase` (`src/engine/branch.ts:74-80`), `prepareTrunkArtifactDir` (`src/engine/branch.ts:58-62`). All export as `async function`. None currently performs a reset; `resetCycleBranchTo` would be the first writer of `git reset --hard`.

- **Log infrastructure** — `src/engine/log.ts:8-18`. `createLogger(repoRoot)` returns a `Logger` whose `emit(event, fields)` JSON-stringifies `{ts, event, ...fields}` to `.cycle/log.jsonl`. Arbitrary extra fields are spread in; adding `head_sha` to a `step.start` is a single-line change at the emit site, no log-schema rewrite needed.

- **Log tail / resume entry** — `src/engine/log-tail.ts`:
  - `parseLogTail(text)` (`src/engine/log-tail.ts:21-97`) returns an `InFlightCycle` descriptor containing `completedSteps` (derived from `step.end status:"ok"` after the in-flight `cycle.start`) and `lastStepStarted` (derived from `step.start` events without matching `step.end`). It does **NOT** currently surface `step.start` payload fields other than `step` and `cycle_id` — the function builds a typed projection and discards everything else. Reading `head_sha` from a prior `step.start` is therefore either (a) a new field on `InFlightCycle` populated by extending the existing backward walk in `parseLogTail`, or (b) an independent backward scan inside `run-cycle.ts` over `.cycle/log.jsonl`. SPEC explicitly leaves the choice to PLAN.
  - `readLogTail(repoRoot)` (`src/engine/log-tail.ts:99-107`) — async wrapper that reads `.cycle/log.jsonl`, returns `null` on `ENOENT`.

- **CLI entry — resume dispatch** — `src/cli.ts:189-291` (`runResumeOnce`). Computes `startStepIndex` from `wfDef.steps` minus `tail.completedSteps` (`src/cli.ts:252-259`), then calls `runCycle(cwd, {resume:{startStepIndex}, …})` at `src/cli.ts:272-278`. The resume path always lands inside `runCycle`; the reset behavior must live there (not in `cli.ts`), so the new logic is local to the engine and `cli.ts` is untouched.

- **Workflow / step model** — `src/engine/workflow.ts:5-19`. `Step.agent` is typed `"claudecode" | "bash"` (note: `Workflow` is loaded by `loadWorkflow`; the `build` step in the default `feature` workflow is the 4th entry — index 3 — with `agent: claudecode, prompt: prompts/build.md`, see `.cycle/workflows.yml`). The `name: "build"` literal is the only signal that a step is the `build` step; there is no separate "writes-code" flag.

- **Default `feature` workflow definition** — `.cycle/workflows.yml` (same shape as `src/defaults/workflows.yml`): step order `spec → research → plan → build → review → fix → verify → commit → pr → reflection`. `build` is the only `claudecode` step in this workflow that writes code to the cycle branch (the other agent steps write a single artifact file under `docs/cycle/<cycle_id>-…/` via `writeFile` at `src/engine/run-cycle.ts:88-89`).

- **`build` prompt** — `src/defaults/prompts/build.md:53-57` — instructs the agent to leave the working tree dirty (`Do NOT commit`); the subsequent `commit` step is what produces the commit. Thus on a mid-build halt the cycle branch tip is unchanged from the moment `build` began, but the working tree (tracked + untracked changes) is dirty — `git reset --hard` cleans both.

- **No existing reset surface** — `grep -n "reset" src/engine/*.ts` returns nothing under `engine/`; this cycle introduces the first reset path in the engine. Subprocess discipline (CLAUDE.md: "Always `spawn` / `spawnSync` with array args. Never `exec` / `execSync`. Never `shell: true`.") applies.

### Existing Patterns to Follow

- **`git` subprocess pattern** — `spawn("git", [...args], { cwd: repoRoot, shell: false })`, accumulate stderr, reject with composed message on non-zero exit. Examples: `src/engine/branch.ts:5-15`, `src/engine/branch.ts:64-72`, `src/engine/run-cycle.ts:13-21`. The new `resetCycleBranchTo(sha)` should reuse `branch.ts`'s module-private `git(repoRoot, args)` helper rather than duplicating spawn boilerplate.

- **Logger field spreading** — `log.emit("step.start", { cycle_id, step, agent, head_sha })`. Extra fields are tolerated everywhere; consumers project only the fields they care about. No schema declaration needed.

- **Tail parsing pattern** — `src/engine/log-tail.ts:21-97` walks events backwards from end, filtering by `event` and `cycle_id`. If `parseLogTail` is extended, follow the same defensive style: type-guard each field (`typeof x === "string"`), `continue` instead of throw on missing/wrong types.

- **Test fixture pattern for `runCycle`** — `tests/engine/run-cycle.test.ts:30-77` is the prototype:
  1. `mkdtemp` repo + bin dirs.
  2. `git init -b main` + `commit --allow-empty -m init`.
  3. Write `.cycle/workflows.yml` via the in-test `workflowYml(stepsBody)` helper (`tests/engine/run-cycle.test.ts:15-28`).
  4. Drop a fake `claude` executable on `PATH` via the bin dir (line 56-57); stub returns `0` (or non-zero to force step failure).
  5. Pass `env: { PATH: \`${bin}:${process.env.PATH}\`, CYCLE_BASE: "main" }` into `runCycle`.
  6. Assert via re-reading `.cycle/log.jsonl` and `git rev-parse` against the repo.
  Resume-specific extension (already in the suite): pre-create the cycle branch with `git checkout -b cycle/feature/<slug>`; call `runCycle({ resume: { startStepIndex } })` — see `tests/engine/run-cycle.test.ts:438-507`.

- **Coverage-as-quality-gate** — CLAUDE.md "Coverage policy": line ≥ 95%, branch ≥ 75%, function ≥ 90%. `npm run test:coverage` exercises this and is invoked during `build`/`fix` workflow steps.

### Dependencies & Integration Points

- **`runCycle` ⇄ `branch.ts`** — current imports: `createCycleBranch, checkoutCycleBranch, checkoutBase, pullBase, prepareTrunkArtifactDir` (`src/engine/run-cycle.ts:6`). A new `resetCycleBranchTo` export must be added here. `branch.ts` is also imported by `src/cli.ts:24` (only `checkoutBase, pullBase`) — adding a new export does not affect that import.

- **`runCycle` ⇄ `log.ts`** — `createLogger` is called once at the top of `runCycle` (`src/engine/run-cycle.ts:34`); the `log` instance is used for every emit. Adding the warning emit (`step.warning {reason:"build_pre_sha_missing"}`) is a single `await log.emit(...)` call; no new logger plumbing.

- **`runCycle` ⇄ `log-tail.ts`** (potential, if PLAN chooses option (a)) — `parseLogTail` is currently imported only from `src/cli.ts:22`. If extended to surface `prevBuildHeadSha` (or similar), the engine would either re-call `parseLogTail` from inside `runCycle` (new import) or hoist the parsed descriptor through the `resume` opt. Both are mechanical; SPEC defers the decision.

- **Cycle log file path** — `.cycle/log.jsonl` at the repo root. `runCycle` already writes to it via the logger; reading from it inside `runCycle` (for the prior-`build`-`step.start` scan) is fine — the engine is single-process per cycle, the file is append-only, and the events the new code needs are written before the resume re-entry by definition.

- **Branch invariant on resume** — `checkoutCycleBranch` (`src/engine/branch.ts:41-47`) is already called before the step loop on resume (`src/engine/run-cycle.ts:50`), so by the time the step-loop body for the resumed `build` step runs, HEAD is on `cycle/<workflow>/<slug>`. SPEC asks for an assertion that the current branch starts with `cycle/` before the reset — `currentBranch()` at `src/engine/run-cycle.ts:13` is the existing helper that returns the abbreviated ref.

- **No new external dependencies** — `git` is already assumed; no env vars, no new tools.

### Test Infrastructure

- **Test framework** — Node's native test runner (`node --test`, spec reporter). Files matched as `tests/**/*.test.ts`. Auto-builds `dist/cycle.js` first via `pretest` (`package.json`); not relevant to engine-only tests but explains test command latency.

- **Test conventions** — One `.test.ts` per source file, located under `tests/<area>/`. For engine code: `tests/engine/`. Naming mirrors source: `tests/engine/branch.test.ts` for `src/engine/branch.ts`, `tests/engine/run-cycle.test.ts` for `src/engine/run-cycle.ts`, etc. Within a file, each `test("…")` is a fully self-contained fixture (no shared `beforeEach`); cleanup is hand-rolled in `finally` blocks via `rm(root, {recursive:true, force:true})`.

- **Real-git fixtures, not mocks** — All branch/log/resume tests `git init` an actual repo into `mkdtemp` and shell out via the engine's real `spawn` paths. No `nock`-style mocking. Stubbed agents are bash scripts on `PATH` (`tests/engine/run-cycle.test.ts:56-57`). This matches CLAUDE.md's coverage policy and the project's "prefer real implementations in tests over heavy mocking" directive.

- **Coverage of the change area (rough, pre-cycle)**:
  - `src/engine/branch.ts` — `tests/engine/branch.test.ts` (10 tests) covers `createCycleBranch`, `checkoutCycleBranch`, `checkoutBase`, `pullBase`, `prepareTrunkArtifactDir`. No existing reset coverage — a new test for `resetCycleBranchTo` lands here.
  - `src/engine/run-cycle.ts` — `tests/engine/run-cycle.test.ts` (12 tests) covers happy/failure paths plus 3 resume tests at lines 438, 509, 552. New tests for the build-restart behavior extend this file or land as `tests/engine/build-restart.test.ts` (SPEC permits either).
  - `src/engine/log-tail.ts` — `tests/engine/log-tail.test.ts` (16 tests). If `parseLogTail` is extended, new tests land here; the existing tests use the `ev(event, fields, ts)` helper (`tests/engine/log-tail.test.ts:8-10`) which spreads arbitrary fields — already friendly to a new field.

## Code References

- `src/engine/run-cycle.ts:32-136` — `runCycle` entry; step loop emits `step.start` at line 73 (the insertion point for `head_sha` on `build`); `resume` branch sets up `checkoutCycleBranch` at line 50 (the point just before the step loop where a build-only pre-step reset would run).
- `src/engine/run-cycle.ts:71-104` — step loop body; need to inject pre-`build` SHA capture (non-resume) and on-resume reset just inside the loop body for `step.name === "build"`.
- `src/engine/run-cycle.ts:13-21` — `currentBranch()` pattern (model for new git helpers).
- `src/engine/branch.ts:5-15` — module-private `git(repoRoot, args)` helper to reuse for `resetCycleBranchTo`.
- `src/engine/branch.ts:64-72` — `revParse(repoRoot, ref)` returns string SHA; either reuse internally for `HEAD` capture or export.
- `src/engine/log.ts:11-17` — `emit(event, fields)` is field-agnostic; adding `head_sha` is one line.
- `src/engine/log-tail.ts:21-97` — `parseLogTail`; potential extension site if PLAN chooses to surface `prevBuildHeadSha` here.
- `src/engine/log-tail.ts:42-57` — backward walk over `step.end` events; mirror for `step.start` walk.
- `src/cli.ts:189-291` — `runResumeOnce`; computes `startStepIndex` and dispatches to `runCycle({resume:...})`. No change expected from this cycle, but the entry point worth knowing for the integration mental model.
- `tests/engine/run-cycle.test.ts:438-507` — existing resume test template; new build-restart tests will follow its fixture shape.
- `tests/engine/run-cycle.test.ts:15-28` — `workflowYml` helper.
- `tests/engine/branch.test.ts` — landing site for unit test of `resetCycleBranchTo`.
- `src/defaults/prompts/build.md:53-57` — confirms the working-tree dirtiness invariant exploited by the hard-reset policy (agent does not commit; commit is the next step).
- `CLAUDE.md:52` — current "Resume from log tail" paragraph to extend with the policy description per SPEC §Documentation Updates.
- `docs/ARCHITECTURE.md:822-826` — current "Resume semantics" bullet; SPEC asks for a one-line cross-reference here pointing back to CLAUDE.md.
- `.cycle/workflows.yml` (top of file) — `feature` workflow steps; `build` is index 3.

## Open Questions

1. **Surface `head_sha` via `parseLogTail`, or do a local backward scan inside `run-cycle.ts`?** SPEC §Dependencies explicitly leaves this for PLAN. The tradeoffs: extending `parseLogTail` keeps log-walking in one place but couples a build-specific concept into a generic descriptor; an inline backward scan keeps the new concern local to `run-cycle.ts` but duplicates a small chunk of JSONL parsing. Either fits the existing patterns.

2. **Where exactly does the SHA capture run on a fresh (non-resume) invocation?** SPEC says "captured via `git rev-parse HEAD` immediately before invoking the agent" — i.e., before the `step.start` emit at `src/engine/run-cycle.ts:73`, since that emit must include the field. The capture is only required when `step.name === "build"`. PLAN should specify the branch in code (likely a small conditional just above the existing emit).

3. **What happens if a prior `step.start` for `build` is found but the SHA it references is no longer reachable?** SPEC doesn't address this corner case explicitly. The most likely cause is human intervention on the cycle branch between halt and resume — recoverable failure modes vs. hard error. PLAN should pick one (e.g., `step.warning {reason:"build_pre_sha_unreachable"}` + skip reset, mirroring the missing-field path).

4. **Type-narrowing in `runCycle`** — `Step.agent` is the union `"claudecode" | "bash"` (`src/engine/workflow.ts:8`), but the build-restart logic gates on `step.name === "build"` (a string), not on agent type. This is consistent with how the existing code matches `step.name === "reflection"` for the reflection ingest hook at `src/engine/run-cycle.ts:91` — same pattern, no new typing concern.
```
