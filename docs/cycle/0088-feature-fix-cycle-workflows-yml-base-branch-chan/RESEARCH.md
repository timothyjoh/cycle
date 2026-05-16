I have all the information needed. Writing the research document now.

```markdown
# Research: Cycle 0088

## Cycle Context

Cycle 0088 fixes a base-branch resolution bug: `run-cycle.ts:127` and
`cli.ts:238` both hardcode `"main"` as the fallback base branch, ignoring
`cfg.engine.base_branch` already declared in `workflows.yml`. The fix threads
`baseBranch` through `RunCycleOpts` and wires both `runCycle` call sites in
`cli.ts` to pass `cfg.engine.base_branch`.

## Current Codebase State

### Relevant Components

- **`RunCycleOpts` type**: `src/engine/run-cycle.ts:84-93` — seven-field type
  with `issueId`, `title`, `workflow`, `cycleId?`, `env?`, `resume?`,
  `attempt?`, `skipCompletedOnRetry?`. No `baseBranch` field today.

- **`CYCLE_BASE` construction**: `src/engine/run-cycle.ts:124-130` — builds
  `cycleEnv` Record. Line 127: `CYCLE_BASE: process.env.CYCLE_BASE ?? "main"`.
  This value propagates to every bash step env and to `checkoutBase`/`pullBase`
  in the `finally` block (lines 245, 257).

- **Resume path `base` variable**: `src/cli.ts:238` —
  `const base = process.env.CYCLE_BASE ?? "main"`. Used directly for
  `checkoutBase(cwd, base)` at line 241 and `pullBase(cwd, base)` at line 242,
  **before** `runCycle` is called. This is independent of the cycleEnv built
  inside `runCycle`.

- **Resume `runCycle` call**: `src/cli.ts:311-319` — passes `cycleId`,
  `issueId`, `title`, `workflow`, `resume`, `attempt`,
  `skipCompletedOnRetry`; no `baseBranch`.

- **Main loop `runCycle` call**: `src/cli.ts:405-412` — passes `cycleId`,
  `issueId`, `title`, `workflow`, `attempt`, `skipCompletedOnRetry`; no
  `baseBranch`.

- **`EngineConfig` type**: `src/engine/workflow.ts:21-25` — has
  `base_branch: string` already. `CycleConfig.engine` is typed `EngineConfig`.

- **`loadConfig`**: `src/engine/workflow.ts:39-66` — parses `.cycle/workflows.yml`,
  returns `CycleConfig`. Called at `src/cli.ts:88`:
  `const cfg = args.dryRun ? null : await loadConfig(cwd)`. Both `runCycle`
  call sites are inside the `!args.dryRun && cfg` guard, so `cfg` is non-null
  and `cfg.engine.base_branch` is available.

- **`.cycle/workflows.yml`**: line 3 — `base_branch: master`. Already correct
  for this dogfood repo. Not to be changed.

- **`src/defaults/workflows.yml`**: Not read yet, but SPEC says `base_branch:
  master` is already set and must stay `main` — no change needed.

- **`finally` block in `runCycle`**: `src/engine/run-cycle.ts:236-263` —
  uses `cycleEnv.CYCLE_BASE` for both `checkoutBase` and `pullBase`. Fixing
  line 127 automatically fixes these downstream usages.

### Existing Patterns to Follow

- **`RunCycleOpts` extension pattern**: Prior additions (`skipCompletedOnRetry`,
  `attempt`, `resume`) were optional fields appended to the type at
  `src/engine/run-cycle.ts:84-93`. `baseBranch?: string` follows the same
  shape.

- **Env-var precedence convention**: The SPEC requires
  `opts.baseBranch ?? process.env.CYCLE_BASE ?? "main"` — env var overrides
  config, matching how `CYCLE_BASE` was the sole mechanism before. The existing
  `env` opt on `RunCycleOpts` (line 89) also follows a layered-override
  pattern.

- **Test repo setup**: All `run-cycle.test.ts` tests use a local `workflowYml()`
  helper (lines 15-28) that inlines `base_branch: main` into the generated
  YAML. Tests pass `env: { PATH: ..., CYCLE_BASE: "main" }` to `runCycle`.
  The new test should pass `baseBranch: "master"` (without `CYCLE_BASE` in
  `env`) and assert via a bash step writing `$CYCLE_BASE` to a file.

- **Bash env-capture pattern**: Several tests (e.g., lines 62-63, 200-202)
  write a shell script that echoes or writes env variables to a file, then
  assert on that file. The "check.sh writes env to file" approach at
  `run-cycle.test.ts:62` is the right model for the new `baseBranch` test.

- **`no_branch: true` test pattern**: `run-cycle.skip-completed.test.ts:15-29`
  shows a `workflowYml()` helper producing a trunk workflow. The new test
  likely uses the simpler no-branch form since the dogfood workflow is trunk.

### Dependencies & Integration Points

- `cfg` available at both call sites — `src/cli.ts:88` loads it once. Both
  `runCycle` invocations are inside the `if (!args.dryRun && cfg)` guard
  (resume: line 334; main loop: line 370+).

- `checkoutBase` / `pullBase` — imported at `src/cli.ts:25`. The resume path
  calls these directly with `base` (line 241-242) independent of what
  `runCycle` receives. Fixing `cli.ts:238` to read `cfg.engine.base_branch`
  fixes the pre-`runCycle` checkout in the resume path.

- `execBashStep` — `src/engine/exec-bash.ts` receives `cycleEnv` directly as
  the step env, so `CYCLE_BASE` set in `cycleEnv` at line 127 reaches bash
  steps automatically.

- TypeScript compilation: `tsc --noEmit` must pass. Adding `baseBranch?:
  string` to `RunCycleOpts` is backward-compatible; all existing call sites
  that omit it continue to compile.

### Test Infrastructure

- **Framework**: Node.js native test runner (`node:test`, `node:assert`).
  No transpile step — tests import `.ts` files directly via
  `--experimental-strip-types` (Node ≥ 22.6).

- **Test conventions**: One `test()` per scenario. Each test creates a
  `mkdtemp` repo, writes minimal `workflows.yml` + scripts, runs `runCycle`,
  asserts on log content or files, then cleans up in `finally`.

- **Run command**: `npm test` (runs `pretest` build first). Coverage via
  `npm run test:coverage`.

- **Existing `run-cycle.test.ts` coverage**: Branch-checkout, base-pull,
  resume modes, head_sha capture, build/fix reset, no_branch bypass — all
  exercised. No test today asserts that `baseBranch` opt overrides the
  hardcoded `"main"` fallback.

- **New test file location**: SPEC recommends `tests/engine/run-cycle.test.ts`
  (existing file) or a new focused file. Given the file is already 1553 lines,
  a new file `tests/engine/run-cycle.base-branch.test.ts` fits the naming
  pattern of the other split files (`run-cycle.skip-completed.test.ts`,
  `run-cycle.spec-guard.test.ts`, etc.).

## Code References

- `src/engine/run-cycle.ts:84-93` — `RunCycleOpts` type — add `baseBranch?:
  string` here
- `src/engine/run-cycle.ts:127` — `CYCLE_BASE: process.env.CYCLE_BASE ?? "main"`
  — change to `opts.baseBranch ?? process.env.CYCLE_BASE ?? "main"`
- `src/engine/run-cycle.ts:124-130` — full `cycleEnv` construction block
- `src/engine/run-cycle.ts:241-262` — `finally` block consuming `cycleEnv.CYCLE_BASE`
- `src/cli.ts:88` — `const cfg = ... await loadConfig(cwd)` — already loaded
- `src/cli.ts:238` — `const base = process.env.CYCLE_BASE ?? "main"` — change
  to `cfg.engine.base_branch`
- `src/cli.ts:311-319` — resume `runCycle` call — add `baseBranch:
  cfg.engine.base_branch`
- `src/cli.ts:405-412` — main loop `runCycle` call — add `baseBranch:
  cfg.engine.base_branch`
- `src/engine/workflow.ts:21-25` — `EngineConfig` with `base_branch: string`
- `.cycle/workflows.yml:3` — `base_branch: master` (correct; no change)
- `tests/engine/run-cycle.test.ts:15-28` — `workflowYml()` helper pattern
- `tests/engine/run-cycle.test.ts:59-64` — `runCycle` call with `env` including
  `CYCLE_BASE` — shows the env-override shape the new test should supersede

## Open Questions

- None. All four change sites are identified with line numbers. The type
  extension, env precedence order, and test approach are all constrained by
  SPEC and existing code patterns.
```
