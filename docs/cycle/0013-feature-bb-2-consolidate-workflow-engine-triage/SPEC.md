# SPEC — Cycle 0013: Consolidate workflows.yml (BB-2)

## Objective
Collapse cycle's split config (`src/defaults/workflows/feature.yaml` plus implicit engine defaults) into a single `src/defaults/workflows.yml` file with three top-level sections — `engine:`, `triage:`, and `workflows[]` — and update the loader so the engine reads the feature workflow from the new shape. This is the configuration foundation that BB-3/BB-4/BB-6/BB-7 build on; without it those cycles have nowhere to declare their config.

## Source Issue
`txt-20260513-034336-bb-2-consolidate-workflow-engine-triage` — "BB-2: Consolidate workflow + engine + triage config into one src/defaults/workflows.yml file."

## Scope

### In Scope
- Create `src/defaults/workflows.yml` with `engine:`, `triage:`, and `workflows:` sections per RFC-001 §4. The `workflows[]` array contains one entry (`feature`) whose `steps:` are byte-equivalent to the current `feature.yaml`, plus `max_cycle_attempts: 3`.
- Update `src/engine/workflow.ts` to load `.cycle/workflows.yml`, parse the new shape, pick a workflow by name from `workflows[]`, and return the same `Workflow` type the rest of the engine consumes. Also expose `engine` and `triage` config (parsed but not yet acted on — consumers land in later cycles).
- Delete `src/defaults/workflows/` subdirectory; update `scripts/sync-defaults.mjs` to copy the single `workflows.yml` (and remove the old `.cycle/workflows/` directory in the dogfood repo).

### Out of Scope
- BB-3 work: new `tbd.jsonl` row schema, drain semantics, reading workflow name from issue frontmatter at pop time. Engine still gets `workflow` via `RunCycleOpts` (current path) — wire-up is BB-3.
- BB-4 triage subroutine implementation. `triage:` section is parsed and exposed but no triage code runs yet.
- BB-6 `max_consecutive_failures` enforcement. Field is parsed and exposed; halt counter is BB-6.
- BB-7 reflection step. Step is not added to the feature workflow yet.
- Reading `engine.base_branch` from yaml. `runCycle` continues to source `CYCLE_BASE` from `process.env`; future cycle will switch this over.

## Requirements
- `src/defaults/workflows.yml` exists and parses to: `engine.max_consecutive_failures` (number), `engine.base_branch` (string), `triage.agent` (string), `triage.prompt` (string), `triage.max_turns` (number), and `workflows[]` (array with at least one entry having `name`, `description`, `max_cycle_attempts`, `steps[]`).
- `src/defaults/workflows/feature.yaml` is removed; the directory `src/defaults/workflows/` is removed.
- `loadWorkflow(repoRoot, "feature")` resolves to `.cycle/workflows.yml`, finds the entry whose `name === "feature"`, and returns a `Workflow` object with the same `name`, `description`, and ordered `steps[]` shape that today's code returns. The engine's `runCycle` continues to work without other changes.
- The loader throws a clear error for: missing file, malformed top-level shape, unknown workflow name, or workflow entry missing `name`/`steps`.
- New API surface: `loadEngineConfig(repoRoot)` and `loadTriageConfig(repoRoot)` (or a single `loadConfig(repoRoot)` returning `{ engine, triage, workflows }`) — chosen so BB-3/BB-4/BB-6 can consume without re-parsing. Implementation detail: cache the parsed yaml once per `repoRoot` call site or read twice — either is fine, document the choice.
- `scripts/sync-defaults.mjs` copies `src/defaults/workflows.yml` → `.cycle/workflows.yml` and removes the stale `.cycle/workflows/` directory (idempotent — succeeds whether the old dir exists or not).
- `npm run sync-defaults` followed by reading `.cycle/workflows.yml` produces the new shape; the old `.cycle/workflows/feature.yaml` no longer exists after sync.

## Acceptance Criteria
- [ ] `src/defaults/workflows.yml` exists with all three sections populated per RFC-001 §4. Step list matches today's feature workflow in name and order: `spec, research, plan, build, review, fix (skip_unless: MUST-FIX.md), verify, commit, pr`.
- [ ] `src/defaults/workflows/` directory does not exist on disk after the change.
- [ ] `src/engine/workflow.ts` reads `.cycle/workflows.yml`, picks the workflow by name, and returns the existing `Workflow`/`Step` types unchanged for downstream callers.
- [ ] Engine config and triage config from `workflows.yml` are exposed via the loader API (callable; values match the file). No consumer is required to use them yet.
- [ ] `scripts/sync-defaults.mjs` updated; `npm run sync-defaults` produces `.cycle/workflows.yml` and removes `.cycle/workflows/`.
- [ ] `.cycle/workflows.yml` committed at the new path (dogfood repo's sync state matches `src/defaults/`).
- [ ] All existing tests pass after migration; tests that referenced `src/defaults/workflows/feature.yaml` or `.cycle/workflows/feature.yaml` migrated to the new path/shape.
- [ ] New test asserts the loader correctly picks `feature` from a multi-entry `workflows[]` array (proves the array-pick logic — not just "the only entry happens to be feature").
- [ ] New test asserts the loader exposes the `engine` and `triage` sections with expected fields.
- [ ] New test asserts the loader throws on unknown workflow name (e.g., `loadWorkflow(root, "nope")`).
- [ ] `npm test` green; `npm run typecheck` clean; coverage line ≥ 95%, branch ≥ 75%, function ≥ 90% (matches CLAUDE.md baseline).
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Framework: Node's native test runner (`node:test`), same as the rest of the suite.
- Migrate three existing tests:
  - `tests/engine/workflow.test.ts` — write a fixture `.cycle/workflows.yml` with the new shape, assert `loadWorkflow(root, "feature")` returns expected steps. Also add a fixture with two entries and assert array-pick works.
  - `tests/defaults/feature-yaml.test.ts` — parse `src/defaults/workflows.yml`, walk to the `feature` entry, assert step name sequence is `[spec, research, plan, build, review, fix, verify, commit, pr]`.
  - `tests/defaults/feature-loadable.test.ts` — copy `src/defaults/workflows.yml` → `.cycle/workflows.yml`, call `loadWorkflow(root, "feature")`, assert nine steps and correct agent types.
- Add new tests:
  - Loader exposes `engine.max_consecutive_failures`, `engine.base_branch`, `triage.agent`, `triage.prompt`, `triage.max_turns` with expected default values.
  - Loader throws (with a useful error) on: missing file, missing `workflows:` array, requested workflow name not found, workflow entry missing `steps`.
- No new E2E/Playwright needed (no UI). The existing `run-cycle.test.ts` exercises the engine end-to-end and should pass unchanged since the loader's return shape is preserved.
- Regression guard: keep an assertion that step count for `feature` is 9 (today's value), so an accidental step add/remove gets flagged.

## Documentation Updates
- **CLAUDE.md**: Architecture quick reference currently says "Default workflow + prompts + scripts that ship into consumer repos: `src/defaults/`." Add one line noting that `workflows.yml` is now the single config file (replaces the `workflows/` subdirectory). One-line change; do not re-document RFC-001.
- **README.md**: No user-facing surface change yet (cycle CLI flags unchanged). No README edit required.
- **docs/ARCHITECTURE.md** / **BRIEF.md**: RFC-001 already documents the consolidated `workflows.yml` shape; no in-place edit required in this cycle. (Wholesale doc reconciliation against RFC-001 is tracked separately — not BB-2's scope.)

Documentation is part of "done" — the one-line CLAUDE.md edit ships in this cycle.

## Dependencies
- BB-1 (cycle 0012) merged: folder rename `tbd/ → raw/`, `queued/ → todo/` is already on master. Issue file for BB-2 is in `docs/cycle/issues/todo/`.
- No new npm deps. `yaml` package is already in the toolchain (used by `workflow.ts`).
- No new env vars or external services.
