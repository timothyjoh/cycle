# SPEC — Cycle 0088: Fix base branch resolution to read from engine config

## Objective
The cycle engine emits `cycle.base_pull status:failed` on every cycle because `run-cycle.ts` and `cli.ts` hardcode `"main"` as the base branch fallback, ignoring the `base_branch: master` already declared in `.cycle/workflows.yml`. This cycle threads `cfg.engine.base_branch` through both call sites so the engine fetches the correct branch and stops accumulating spurious failure events in the log.

## Source Issue
`refl-0084-cycle-base-pull-fails-on-every-cycle-wor` — "Fix .cycle/workflows.yml base branch: change `main` to `master`"

## Scope

### In Scope
- Add `baseBranch?: string` to `RunCycleOpts` in `src/engine/run-cycle.ts`; use it (falling back to `process.env.CYCLE_BASE ?? "main"`) at line 127 where `CYCLE_BASE` is set
- Fix `src/cli.ts:238` resume-path `base` variable to read `cfg.engine.base_branch` instead of hardcoded `"main"`
- Pass `baseBranch: cfg.engine.base_branch` in both `runCycle` call sites in `cli.ts` (resume ~line 311, main loop ~line 405)
- Add regression tests asserting the config value flows through correctly

### Out of Scope
- Centralizing base-branch resolution in a dedicated engine module (tracked as `refl-0040`)
- Changing `src/defaults/workflows.yml` — its `base_branch: master` value is already correct and ships to consumers who also use `master`
- Any changes to `.cycle/workflows.yml` — `base_branch: master` is already set correctly

## Requirements
- `runCycle` must accept `baseBranch` in its opts and use it as the `CYCLE_BASE` env var value
- The resume path in `cli.ts` must derive its `base` from `cfg.engine.base_branch`, not a hardcoded string
- Both `runCycle` call sites pass `baseBranch: cfg.engine.base_branch`
- Existing `process.env.CYCLE_BASE` override still works (env var takes precedence over config, matching prior behavior)
- No change to the public YAML schema — `base_branch` key in `engine:` block is already defined in `EngineConfig`

## Acceptance Criteria
- [ ] `src/engine/run-cycle.ts`: `RunCycleOpts` has `baseBranch?: string`; line 127 uses `opts.baseBranch ?? process.env.CYCLE_BASE ?? "main"`
- [ ] `src/cli.ts`: resume-path `base` variable (line 238) reads `cfg.engine.base_branch` not a literal string
- [ ] `src/cli.ts`: both `runCycle` call sites pass `baseBranch: cfg.engine.base_branch`
- [ ] A test asserts that when `baseBranch: "master"` is passed to `runCycle`, the spawned step env contains `CYCLE_BASE=master`
- [ ] `npm test` passes with no regressions
- [ ] No compiler warnings (`npm run typecheck` clean)

## Testing Strategy
- Unit test in `tests/engine/run-cycle.test.ts` (or a new focused test file): spy/stub the step executor to capture the `env` passed to it; assert `CYCLE_BASE` equals the `baseBranch` option value
- Verify existing tests still pass — no behavior change for callers that don't pass `baseBranch` (falls back to env/`"main"`)

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No change — `base_branch` in `workflows.yml` already documented under Architecture quick reference
- **README.md**: No user-facing change required

## Dependencies
- `EngineConfig.base_branch: string` already defined in `src/engine/workflow.ts:23` — no schema changes needed
- `cfg` (type `CycleConfig`) already available at both `runCycle` call sites in `cli.ts`
