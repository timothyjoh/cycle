# Research: Cycle 0038

## Cycle Context
SPEC 0038 closes the within-budget retry gap in the failed-cycle dirty-worktree residue guard (cycle 0036). The guard currently arms its in-memory `pendingResidueContext` only at the three **terminal** failure branches in `src/cli.ts` (commit-failed, fast-bail, attempts-exhausted) plus the resume terminal path. It does **not** arm it on the within-budget retry arm (`else if (row.attempt + 1 < maxAttempts) { await drainRetry(...) }`). Consequently a `spec`/`build`/`review` step that fails mid-write — leaving uncommitted residue under `src/**`, `scripts/**`, or `tests/**` — but still has retry budget loops back to the top of the `while (!halted)` supervisor loop with `pendingResidueContext` unset, so the loop-top `haltIfResidue()` is a no-op and the retry re-runs on the dirty tree. The cycle arms `pendingResidueContext = { cycleId, issueId: row.id, failingStep }` on that retry arm (mirroring the terminal branches) so the existing loop-top guard halts before `drainRetry`'s re-run. No new halt reason, no new check function, no change to the guard module. Tests + `docs/ENGINE.md` + `CLAUDE.md` doc updates are in scope.

## Current Codebase State

### Relevant Components
- Supervisor loop & all `pendingResidueContext` assignments — `src/cli.ts:292` (declaration), `:580`, `:591`, `:598`, `:606`, `:609` (resume path), `:699`, `:725`, `:741`, `:780`, `:801` (loop branches)
- **The within-budget retry arm — the change site (no `pendingResidueContext` set today)** — `src/cli.ts:787-789`
- `haltIfResidue()` — the residue check; no-op when `pendingResidueContext` unset — `src/cli.ts:527-547`
- `emitResidueHalt()` — emits the single `engine.halted` + terminal `engine.stop`, sets `engineStopEmitted`, writes diagnostic to stderr — `src/cli.ts:549-571`
- Loop-top gated site (`await haltIfResidue()` before `popNextPending`) — `src/cli.ts:621-625`
- Resume gated site (`await haltIfResidue()` before `runResumeOnce`) — `src/cli.ts:581`
- `drainRetry()` — moves issue back for retry, emits `queue.drained {outcome:"retry"}` + `issue.failed` — `src/cli.ts:323-333`
- Residue guard module (out of scope to modify) — `src/engine/failed-residue-guard.ts:1-81`: `ResidueContext` type (`:4-8`), `parseDirtyPaths` (`:14-31`), `isEngineOwned` (`:39-45`), `readFailedCycleResidue` (`:52-64`, **throws** on git non-zero), `formatFailedCycleResidueDiagnostic` (`:66-80`)

### Existing Patterns to Follow
- **Arm-context pattern**: every terminal-failure branch sets `pendingResidueContext = { cycleId, issueId: row.id, failingStep }` immediately before deciding to halt or continue; the loop-top `haltIfResidue()` consumes it on the next iteration — `src/cli.ts:725`, `:780`, `:801`. The within-budget arm at `:787` is the lone failure branch missing this assignment. The field shape is exactly `{ cycleId, issueId, failingStep }` (`ResidueContext`, `src/engine/failed-residue-guard.ts:4-8`).
- **Context clearing**: success/noop/clean-tree paths set `pendingResidueContext = undefined` (`src/cli.ts:699`, `:741`, `:606`, `:609`, `:591`); `haltIfResidue` also clears it on a clean tree (`src/cli.ts:541`).
- **Gated-site count is structurally pinned**: a structural invariant requires **exactly two** `await haltIfResidue()` calls in `src/cli.ts` (resume + loop-top) — `scripts/structural-invariants.mjs:45-51` (`pattern: /await haltIfResidue\(\)/g, expected: 2`). The fix must arm the context, **not** add a third `haltIfResidue()` call. Fixtures: `tests/fixtures/structural-invariants/cli-clean.ts:9-10`, `cli-violation.ts:8-9`.
- **Failure handling**: `readFailedCycleResidue` **throws** on `git status` non-zero (never coerced to clean); `haltIfResidue` catches and halts with `dirty_paths: []` + `message: "Residue check failed after cycle <id>: <err>"` — `src/cli.ts:532-539`, `src/engine/failed-residue-guard.ts:58-61`.
- **Engine-owned exclusion**: `isEngineOwned` excludes `isDenied` paths, the whole `.cycle/**` tree, and the whole `docs/cycle/**` tree — so the issue-lifecycle move `drainRetry` performs (and `.cycle/**` state writes) never trip the guard — `src/engine/failed-residue-guard.ts:39-45`.
- **Observability**: structured JSONL events to `.cycle/log.jsonl` via `log.emit`. The halt path emits `engine.halted { reason: "failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths, message }` then `engine.stop { status:"halted", reason:"failed_cycle_dirty_worktree", halted_at_issue, failing_step }`, then stderr diagnostic — `src/cli.ts:554-570`.
- **Exactly-one `engine.stop`**: `engineStopEmitted = true` (`src/cli.ts:569`) suppresses the epilogue's `engine.stop` emission — `src/cli.ts:824-834`. The epilogue `engine.halted { reason:"max_consecutive_failures" }` (`:813-819`) is a separate, unrelated halt path.
- **Idempotency / retry-safety**: PID lockfile via `acquireLock`/`releaseLock` (`src/engine/engine-lock.ts`) enforces single-engine exclusion; `pendingResidueContext` is the in-memory dedup guard ensuring residue is checked once per loop iteration.

### Dependencies & Integration Points
- `src/engine/failed-residue-guard.ts` — `readFailedCycleResidue`, `isEngineOwned`, `formatFailedCycleResidueDiagnostic`, `ResidueContext` (imported into `src/cli.ts`); out of scope to change.
- `src/cli.ts` supervisor machinery: `pendingResidueContext`, `haltIfResidue`, `emitResidueHalt`, `engineStopEmitted`, `drainRetry` — all cycle 0036; the change is confined to the within-budget arm at `:787-789`.
- `scripts/structural-invariants.mjs` — the `expected: 2` `haltIfResidue` invariant the change must not violate (run via `npm run check:invariants`).
- No new external services or env vars (per SPEC Dependencies).

### Test Infrastructure
- **Framework**: Node's built-in `node:test` + `node:assert` (`import { test } from "node:test"; import { strict as assert }`).
- **CLI/supervisor test harness**: `tests/cli/failed-residue-guard.test.ts:1-285` — spawns the built `dist/cycle.js` via `spawnSync("node", [dist, "run"], { cwd: root })` against a real temp git repo. Helpers: `ensureDist` (`:10`), `bootstrapRepo` (`:16`, git init + `.cycle/workflows.yml` + bash scripts), `seedTodo` (`:43`, writes `todo/<id>.md` + appends a `tbd.jsonl` row), `workflowYml(maxConsecutive, maxCycleAttempts)` (`:69`), `readEvents` (`:90`, parses `.cycle/log.jsonl`).
- **Existing bash-script fixtures** (drive the failure shape): `RESIDUE_SCRIPT` (writes `src/residue.ts`, `exit 1` — `:96-100`), `ENGINE_OWNED_SCRIPT` (writes only `docs/cycle/**` + `.cycle/run.log`, `exit 1` — `:103-108`), `GIT_FAILURE_SCRIPT` (writes residue then `rm -rf .git`, `exit 1` — `:111-116`), `CLEAN_FAIL_SCRIPT` (`exit 1`, no worktree change — `:119-121`).
- **Failure-path coverage already present**: loop-path halt (`:123`), resume-path halt (`:168`), engine-owned-only no-trip (`:211`), clean-tree no-event (`:234`), git-status-failure halt (`:259`). All existing tests construct the workflow with `workflowYml(2, 1)` — `maxCycleAttempts: 1`, which forces every failure to the **terminal** branch (`row.attempt + 1 < maxAttempts` is false). **A within-budget retry test must use `maxCycleAttempts >= 2`** so `:787` is reached on the first failure.
- **Cardinality-pinning convention**: exactly-once engine events asserted with `filter(predicate).length === 1` (e.g. `tests/cli/failed-residue-guard.test.ts:137-140`, `:156-158`), never bare `find` (CLAUDE.md *Test conventions*).
- **Module-level unit tests**: `tests/engine/failed-residue-guard.test.ts` covers the guard module's pure functions (out of scope to change).
- **Coverage**: `src/cli.ts` is **not** in the per-file `FLOORS` table (CLAUDE.md *Coverage policy*); global floors apply (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%), enforced by `scripts/coverage-gate.mjs` after `npm run test:coverage`.

## Code References
- `src/cli.ts:787-789` — within-budget retry arm; calls `drainRetry` but does **not** set `pendingResidueContext` (the gap to close).
- `src/cli.ts:780` — fast-bail branch arming `pendingResidueContext = { cycleId, issueId: row.id, failingStep }` (the exact assignment shape to mirror onto the retry arm).
- `src/cli.ts:801` — attempts-exhausted branch with the same assignment shape.
- `src/cli.ts:621-625` — loop-top `haltIfResidue()` gate that will consume the newly-armed context on the next iteration before `popNextPending`.
- `src/cli.ts:527-547` — `haltIfResidue` (no-op when unset; halts on residue or git-status throw; clears on clean tree).
- `src/cli.ts:549-571` — `emitResidueHalt` (single `engine.halted` + terminal `engine.stop` + stderr diagnostic + `engineStopEmitted`).
- `src/cli.ts:323-333` — `drainRetry` (issue-lifecycle move + `queue.drained {outcome:"retry"}` + `issue.failed`; its `docs/cycle/**` move is engine-owned-excluded).
- `src/engine/failed-residue-guard.ts:39-45` — `isEngineOwned` (excludes `.cycle/**`, `docs/cycle/**`, `isDenied` paths).
- `src/engine/failed-residue-guard.ts:52-64` — `readFailedCycleResidue` (throws on git non-zero; never coerces a failed check to clean).
- `scripts/structural-invariants.mjs:45-51` — the `expected: 2` `haltIfResidue` invariant (must not add a third call).
- `docs/ENGINE.md:60-72` — *Failed-cycle dirty-worktree residue guard* section; `:68` (**Both gated paths**) and `:72` (**Recon-parity retry gap**) are the lines to update to a third gated arm / narrowed cross-process-restart-only gap.
- `tests/cli/failed-residue-guard.test.ts:96-121` — bash-script fixtures reusable for the new within-budget retry test.

## Open Questions
- Should the new within-budget retry test re-run the failing step a second time (to assert the retry attempt's `cycle.start`/`step.start` does **not** appear after the residue halt) or assert solely on the absence of a second `cycle.start` after the halt? The SPEC Testing Strategy calls for asserting the retry attempt does not appear after the halt; the harness produces one `cycle.start` per `spawnRunOne`, so asserting `cycle.start` count `=== 1` (as the loop-path test does at `tests/cli/failed-residue-guard.test.ts:146-147`) is the available signal — the planner should confirm which assertion form is preferred.
- The within-budget retry test needs `maxCycleAttempts >= 2` (so `:787` is reached) with `max_consecutive_failures` set high enough that the residue guard — not `max_consecutive_failures` — is what halts on the first failure; the planner should confirm the exact `workflowYml(maxConsecutive, maxCycleAttempts)` values (existing tests use `workflowYml(2, 1)`).
