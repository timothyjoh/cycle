I have everything I need. Writing the research document now.

```markdown
# Research: Cycle 0116

## Cycle Context

SPEC asks for centralized base-branch resolution. Every call site that
decides which branch to fetch/checkout/merge currently falls back to a
hardcoded `"main"` when `CYCLE_BASE` env var is absent. The fix is a
single `resolveBaseBranch` helper in `src/engine/branch.ts` that reads
(1) per-todo frontmatter `base_branch`, then (2) `cfg.engine.base_branch`,
with no silent literal fallback. `RunCycleOpts` gets an optional
`baseBranch` field so callers can pass the resolved value in. All four
hardcoded-`"main"` call sites must be routed through the helper.

---

## Current Codebase State

### Relevant Components

- **`CYCLE_BASE` env fallback in `runCycle`** — `src/engine/run-cycle.ts:129`
  ```ts
  CYCLE_BASE: process.env.CYCLE_BASE ?? "main",
  ```
  This sets the `CYCLE_BASE` env var for all workflow step agents and is
  later read by the `finally` block for `checkoutBase` / `pullBase` calls
  (lines 243, 247, 249, 251, 256, 259, 260, 262). Every downstream log
  event (`cycle.checkout`, `cycle.base_pull`) reads `cycleEnv.CYCLE_BASE`.

- **`CYCLE_BASE` env fallback in `runResumeOnce`** — `src/cli.ts:163`
  ```ts
  const base = process.env.CYCLE_BASE ?? "main";
  ```
  Used immediately to call `checkoutBase(cwd, base)` (line 166) and
  `pullBase(cwd, base)` (line 167) as part of the resume base-refresh.
  This is the second hardcoded-`"main"` site.

- **`RunCycleOpts` type** — `src/engine/run-cycle.ts:84-93`
  Currently has no `baseBranch` field. Fields: `issueId`, `title`,
  `workflow`, `cycleId?`, `env?`, `resume?`, `attempt?`,
  `skipCompletedOnRetry?`.

- **`EngineConfig.base_branch`** — `src/engine/workflow.ts:27`
  Declared as `base_branch: string` (required, not optional). Already
  parsed from `workflows.yml` by `loadConfig` and passed through as
  `cfg.engine.base_branch`.

- **`Workflow` type** — `src/engine/workflow.ts:18-23`
  Does **not** have a `base_branch` field. Fields: `name`, `description?`,
  `max_cycle_attempts`, `steps`.

- **`commitCycle` already uses `cfg.engine.base_branch`** — `src/cli.ts:253`, `src/cli.ts:360`
  Both the resume path and the main drain loop pass
  `baseBranch: cfg.engine.base_branch` to `commitCycle`. This is the
  correct pattern — `commitCycle` uses it for `git push origin <baseBranch>`
  (`src/engine/commit-cycle.ts:206`).

- **`branch.ts` exports** — `src/engine/branch.ts`
  Current exports: `createCycleBranch` (28), `checkoutCycleBranch` (41),
  `checkoutBase` (49), `prepareTrunkArtifactDir` (58), `pullBase` (74),
  `currentBranchName` (82), `revParseHead` (92), `resetCycleBranchTo` (96),
  `shaExists` (104). No `resolveBaseBranch` exists yet.

- **`parseFrontmatter` usage pattern** — `src/cli.ts:199-205`
  Both the resume path and the main loop read `fm.workflow` from the todo
  file via `parseFrontmatter`. The same pattern is the established
  convention for reading per-todo overrides. `fm.base_branch` can be read
  the same way.

- **`workflows.yml` declares `base_branch: master`** — `.cycle/workflows.yml:3`
  and `src/defaults/workflows.yml:3`. Both have `base_branch` in the
  `engine:` block.

- **`CYCLE_BASE` used in prompt templates** — `src/defaults/prompts/reflection.md:24`
  and `src/defaults/prompts/documentation.md:20`. These reference
  `"${CYCLE_BASE}"` in shell expressions inside prompts — they rely on
  the env var being set correctly by `runCycle`'s `cycleEnv` block.

### Existing Patterns to Follow

- **Per-todo frontmatter override pattern**: `src/cli.ts:199-205` and
  `src/cli.ts:330-336`. `parseFrontmatter` returns `{ fm, body }`;
  `fm.workflow` is read as a string override. `fm.base_branch` follows
  the same shape.

- **`branch.ts` helper pattern**: All git operations are pure async
  functions taking `(repoRoot: string, ...)`. `resolveBaseBranch` should
  be a synchronous or pure-value function (no I/O) taking the config and
  optional frontmatter string, returning `string`.

- **`cfg.engine.base_branch` propagation**: `commitCycle` already receives
  `baseBranch` as an explicit parameter rather than reading it from env.
  The planner should apply the same explicit-parameter discipline to
  `runCycle`.

- **`CYCLE_BASE` env var discipline**: The env var is already set inside
  `cycleEnv` and passed to step agents. After the fix, its value should
  come from `resolveBaseBranch` rather than the raw env. The env var
  itself stays as a debug override escape hatch per the SPEC decision.

### Dependencies & Integration Points

- `src/cli.ts` → `runCycle` (passes `RunCycleOpts`); will need to resolve
  `baseBranch` before calling and pass it in.
- `src/cli.ts` → `runResumeOnce` → `checkoutBase` + `pullBase` directly
  (lines 166–167); will need `base` to come from `resolveBaseBranch`.
- `src/engine/run-cycle.ts` → `cycleEnv.CYCLE_BASE` feeds into all bash
  step agents and the `finally` checkout/pull block.
- `src/engine/branch.ts` — target file for `resolveBaseBranch` export.
- `src/engine/workflow.ts` — `EngineConfig.base_branch` is the primary
  config source; `Workflow` type currently has no `base_branch`.

### Test Infrastructure

- **Framework**: Node.js native test runner (`node:test`), no transpile
  step, `--experimental-strip-types`.
- **Engine test directory**: `tests/engine/` — includes `run-cycle.test.ts`,
  `branch.test.ts`, etc.
- **CLI test directory**: `tests/cli/` — includes `resume.test.ts`,
  `multi-loop.test.ts`, `queue-drain.test.ts`, etc.
- **Fixture pattern for `runCycle` tests**: `run-cycle.test.ts` uses
  `mkdtemp` to create an isolated repo, writes `workflows.yml` inline via
  `workflowYml(stepsBody)` helper (lines 33-49), calls `runCycle` directly.
  Base branch in fixtures is currently `"main"` (line 18, 38 of
  `run-cycle.test.ts`).
- **CLI integration tests**: `resume.test.ts` uses `setupRepoWithOrigin`
  (line 70) which calls `git init -b main`. These create real git repos
  with an origin and run the compiled `dist/cycle.js` binary via spawn.
- **Coverage gate**: `scripts/coverage-gate.mjs` enforces per-file line
  floors. Current floors include `src/engine/branch.ts` if added — check
  the FLOORS table in that file to confirm whether `branch.ts` has a floor
  entry (it was not listed in `CLAUDE.md`'s per-file floor list, so adding
  one may be needed).

---

## Code References

- `src/engine/run-cycle.ts:129` — `CYCLE_BASE: process.env.CYCLE_BASE ?? "main"` (first hardcoded-main site)
- `src/engine/run-cycle.ts:84-93` — `RunCycleOpts` type (no `baseBranch` field yet)
- `src/engine/run-cycle.ts:238-265` — `finally` block using `cycleEnv.CYCLE_BASE` for checkout/pull
- `src/cli.ts:163` — `const base = process.env.CYCLE_BASE ?? "main"` (second hardcoded-main site, resume path)
- `src/cli.ts:166-167` — `checkoutBase(cwd, base)` + `pullBase(cwd, base)` in resume
- `src/cli.ts:196-205` — frontmatter-override read for `workflow` field (precedent for `base_branch`)
- `src/cli.ts:253` — `baseBranch: cfg.engine.base_branch` passed to `commitCycle` (resume path)
- `src/cli.ts:360` — `baseBranch: cfg!.engine.base_branch` passed to `commitCycle` (main loop)
- `src/engine/workflow.ts:25-30` — `EngineConfig` type with required `base_branch: string`
- `src/engine/workflow.ts:18-23` — `Workflow` type (no `base_branch`)
- `src/engine/branch.ts:49` — `checkoutBase(repoRoot, base)` — target of post-cycle checkout
- `src/engine/branch.ts:74` — `pullBase(repoRoot, base)` — target of post-cycle pull
- `src/engine/commit-cycle.ts:180` — `baseBranch: string` in `commitCycle` opts (established pattern)
- `src/engine/commit-cycle.ts:206` — `git push origin opts.baseBranch` uses the explicit param
- `src/defaults/prompts/reflection.md:24` — `"${CYCLE_BASE}"` used in prompt shell expression
- `src/defaults/prompts/documentation.md:20` — `"${CYCLE_BASE}"` used in prompt shell expression
- `.cycle/workflows.yml:3` — `base_branch: master` (dogfood config)
- `src/defaults/workflows.yml:3` — `base_branch: master` (shipped default)
- `tests/engine/run-cycle.test.ts:18,38` — fixture `workflows.yml` uses `base_branch: main`
- `tests/cli/resume.test.ts:73` — `git init -b main` in origin fixture

---

## Open Questions

1. **`wf.base_branch` vs `cfg.engine.base_branch`**: The SPEC describes
   `resolveBaseBranch(workflow, todoFrontmatter)` where the second tier is
   `wf.base_branch`, but `Workflow` type has no `base_branch` field today.
   The planner must decide: (a) add `base_branch?: string` to the `Workflow`
   type and YAML schema so per-workflow overrides are possible, or (b) treat
   the second tier as `cfg.engine.base_branch` only and pass the engine
   config (not the workflow object) to `resolveBaseBranch`. The SPEC note
   "no type change needed" suggests option (b) — `EngineConfig.base_branch`
   is already `string` and the `Workflow` type stays untouched.

2. **Where in `cli.ts` is `base_branch` read from frontmatter?**: The main
   loop reads the todo file for `fm.workflow` (lines 330-336) but has no
   corresponding `fm.base_branch` read. The resume path reads it too (lines
   199-205). The planner must add frontmatter reads in both places and
   thread the result into `runCycle` as `baseBranch` and into the resume
   base-refresh `base` variable.

3. **`coverage-gate.mjs` FLOORS table**: Does `src/engine/branch.ts`
   currently have a per-file floor entry? If `resolveBaseBranch` adds new
   branches, the planner should verify whether a floor needs adding.
```
