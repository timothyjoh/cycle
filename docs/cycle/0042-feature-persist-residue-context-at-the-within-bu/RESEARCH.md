I have all the information needed to write the research document.

# Research: Cycle 0042

## Cycle Context
SPEC.md asks to close the last crash-safety gap in the failed-cycle dirty-worktree residue guard. Cycle 0039 made the guard crash-safe across the four terminal-failure branches by mirroring the in-memory `pendingResidueContext` to `.cycle/failed-residue-context.json` via `persistResidue`/`unpersistResidue`. The within-budget `drainRetry` arm (cycle 0038, `src/cli.ts:866–871`) still arms `pendingResidueContext` **in memory only** — it never calls `persistResidue`. The cycle must add `await persistResidue(pendingResidueContext);` adjacent to that in-memory assignment (mechanically symmetric to the four persisted branches), add regression tests, and update the doc notes (CLAUDE.md / `docs/ENGINE.md`) that currently call this arm the remaining un-persisted limitation. No new state file, event, or schema change — it reuses `src/engine/residue-context-store.ts` and the existing `ResidueContext` shape.

## Current Codebase State

### Relevant Components
- Supervisor loop & residue lifecycle: `src/cli.ts` — declares `pendingResidueContext` and the persistence wrappers, and threads them through every failure/clear branch.
- Within-budget `drainRetry` arm (the gap): `src/cli.ts:866–871` — `else if (row.attempt + 1 < maxAttempts)` branch. Calls `drainRetry(...)` then sets `pendingResidueContext = { cycleId, issueId: row.id, failingStep };` with **no** `await persistResidue(...)` call following it (contrast with the persisted branches below).
- Persistence wrappers: `src/cli.ts:250–271` — `persistResidue(ctx)` (best-effort `writeResidueContext`; on throw emits `engine.warning { reason: "residue_context_write_failed", cycle_id, issue_id, error }`) and `unpersistResidue()` (best-effort `deleteResidueContext`; on throw emits `engine.warning { reason: "residue_context_delete_failed", error }`). Neither throws.
- State file store: `src/engine/residue-context-store.ts` — `writeResidueContext` (atomic tmp+rename, `:30–43`), `readResidueContext` (tolerant: `none`/`ok`/`corrupt`, never throws, `:49–80`), `deleteResidueContext` (ENOENT-swallowing idempotent unlink, `:90–96`), `ResidueStoreDeps` injectable filesystem deps (`:23`).
- Residue detection / halt emission: `src/cli.ts:596–641` — `haltIfResidue()` (no-op when context unset; reads `readFailedCycleResidue(cwd)`; on a thrown git-status error emits the halt with `dirty_paths: []` and a `Residue check failed…` message; clean tree clears context + calls `unpersistResidue()`; residue present formats the diagnostic and calls `emitResidueHalt`) and `emitResidueHalt()` (emits `engine.halted { reason: "failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths, message }` + terminal `engine.stop`, sets `engineStopEmitted = true`, writes the message to stderr).
- Residue guard primitives: `src/engine/failed-residue-guard.ts` — `ResidueContext` type (`:4`), `parseDirtyPaths` (`:14`), `isEngineOwned` (`:39`), `readFailedCycleResidue` (`:52`, throws on `git status` non-zero), `formatFailedCycleResidueDiagnostic` (`:66`).
- Residue context path: `src/cli.ts:240` — `const residueContextPath = join(cwd, ".cycle", "failed-residue-context.json");`
- State declarations: `src/cli.ts:241–243` — `cyclesProcessed`, `pendingResidueContext: ResidueContext | undefined`, `engineStopEmitted` (declared early so the startup re-check can read them).

### Existing Patterns to Follow
- **Persist-adjacent-to-set pattern**: every terminal-failure branch sets `pendingResidueContext = {…}` then immediately `await persistResidue(pendingResidueContext);`. The four persisted sites:
  - Commit-failed terminal: `src/cli.ts:801–802`.
  - Fast-bail terminal: `src/cli.ts:858–859`.
  - Attempts-exhausted terminal: `src/cli.ts:883–884`.
  - Resume terminal: `src/cli.ts:670–671`.
  The within-budget arm (`src/cli.ts:871`) is the lone set-without-persist site; the fix mirrors lines `883–884`/`801–802` exactly.
- **Clear-adjacent-to-unset pattern**: every clear transition sets `pendingResidueContext = undefined` then `await unpersistResidue();`:
  - No-op drain (exit 3): `src/cli.ts:774–775`.
  - Success drain: `src/cli.ts:818–819`.
  - Resume-ok: `src/cli.ts:661–662`; resume-noop: `:679–680`; resume-skipped/retry: `:683–684`.
  - Clean-tree branch inside `haltIfResidue()`: `src/cli.ts:610–611`.
  - Startup corrupt-file drop: `src/cli.ts:319`.
  These clear sites key off the same `pendingResidueContext` lifecycle; SPEC says verify coverage, add a delete only if a path is uncovered. The clean-tree clear inside `haltIfResidue()` (`:610–611`) covers the loop-top/resume/startup re-check transitions a recovered within-budget retry flows through.
- **Startup cross-process re-check** (`src/cli.ts:312–328`): reads `readResidueContext(residueContextPath)`; `corrupt` ⇒ `engine.warning { reason: "residue_context_unreadable" }` + `unpersistResidue()`; `ok` ⇒ loads into `pendingResidueContext` and runs `haltIfResidue()` (residue ⇒ `process.exit(1)`). Runs after lock/config/`engine.start`/preflight, before triage and the resume/loop work. Not gated on `cfg`.
- **Loop-top gate** (`src/cli.ts:692–699`): `while (!halted)` begins with `if (await haltIfResidue()) { halted = true; haltReason = "failed_cycle_dirty_worktree"; break; }` — the within-budget retry's in-memory context is consumed here before `popNextPending`.
- **Resume gate** (`src/cli.ts:643–688`): arms context from the log tail, `haltIfResidue()` before `runResumeOnce`.
- Failure handling: the persist/unpersist wrappers are best-effort and never throw — a write/delete failure is downgraded to an `engine.warning` and falls back to in-memory-only behavior; it must never mask the retry's own failure routing (`src/cli.ts:250–271`). `haltIfResidue` treats a thrown `git status` non-zero as a halt (`dirty_paths: []`, `Residue check failed…`), never coerced to "clean" (`src/cli.ts:601–608`).
- Observability: structured events to `.cycle/log.jsonl` via `log.emit(event, payload)`. Relevant events: `engine.halted`, `engine.stop`, `engine.warning { reason: "residue_context_write_failed" | "residue_context_delete_failed" | "residue_context_unreadable" }`, `cycle.start`, `queue.drained`, `issue.failed`. Exactly-once events (`engine.halted`, `engine.stop`) are cardinality-pinned with `filter(...).length === 1` in tests.
- Idempotency / retry-safety: the PID lockfile (`src/engine/engine-lock.ts`) enforces single-engine exclusion; `engineStopEmitted` enforces exactly one terminal `engine.stop`; the atomic tmp+rename write means a crash mid-write leaves only `<path>.tmp` (engine-owned, ignored by the read path); `deleteResidueContext` swallows ENOENT for idempotent deletes. `isEngineOwned`/`isDenied` exclude `.cycle/**` so the state file can never itself trip the guard.

### Dependencies & Integration Points
- `src/engine/residue-context-store.ts` — imported into `src/cli.ts` (`writeResidueContext`, `readResidueContext`, `deleteResidueContext` at `:36–38`); `persistResidue`/`unpersistResidue` wrap it. No new helpers needed.
- `src/engine/failed-residue-guard.ts` — `ResidueContext`, `readFailedCycleResidue`, `formatFailedCycleResidueDiagnostic` consumed by `haltIfResidue`/`emitResidueHalt`. Unchanged by this cycle.
- `drainRetry` (`src/cli.ts:392–402`) — emits `queue.drained { outcome: "retry" }` + `issue.failed`; precedes the in-memory set at the within-budget arm. Unchanged.
- Operating mode: `CYCLE_TRUNK_BASED=1` (`.cycle/.env`) — the residue sits directly on the base branch in trunk mode, the critical scenario; re-injected into run-one children at `src/cli.ts:428–432`. No new env vars.

### Test Infrastructure
- Test framework: Node built-in test runner (`node:test`, `node:assert/strict`) run via `--experimental-strip-types` (no transpile). End-to-end tests spawn the built `dist/cycle.js` with `spawnSync("node", [dist, "run"], { cwd: root })`.
- Test conventions: residue-guard tests live in `tests/cli/failed-residue-guard.test.ts`. Helpers: `ensureDist()` (`:10`), `bootstrapRepo()` (`:16` — git init, `.cycle/workflows.yml`, scripts, issue dirs), `seedTodo()` (`:43` — writes a todo `.md` + appends a `tbd.jsonl` row), `workflowYml(maxConsecutive, maxCycleAttempts)` (`:69` — single bash `verify` step), `readEvents()` (`:90` — parses `.cycle/log.jsonl`), `CONTEXT_FILE` constant (`:95`), `writeContext()` (`:97`), `contextExists()` (`:104`). Verify-script fixtures: `RESIDUE_SCRIPT` (writes `src/residue.ts` then exit 1, `:114`), `ENGINE_OWNED_SCRIPT` (`:121`), `GIT_FAILURE_SCRIPT` (writes residue + `rm -rf .git`, `:129`), `CLEAN_FAIL_SCRIPT` (`:137`). Exactly-once events asserted with `filter(...).length === 1`.
- `maxCycleAttempts=2` drives the within-budget retry arm: the first failure (`attempt 0 + 1 < 2`) takes the retry path; `maxCycleAttempts=1` drives terminal-failure branches. The retry arm never calls `recordTerminalFailure`, so `consecutiveFailures` stays 0 and the residue guard (not `max_consecutive_failures`) is what halts.
- Current coverage of the change area — existing within-budget retry tests (in-memory gate, `workflowYml(2, 2)`):
  - "within-budget retry halts before drainRetry re-runs on dirty tree" (`:277`) — asserts one residue halt, `dirty_paths` includes `src/residue.ts`, exactly one `cycle.start` (retry did not re-run), one `engine.stop`.
  - "within-budget retry with git-status failure halts" (`:322`).
  - "clean-tree within-budget retry proceeds unchanged" (`:348` — two `cycle.start`s, no residue event).
  - "engine-owned-only within-budget retry does not trip the guard" (`:378`).
- Failure-path test coverage — cross-process persistence tests (cycle 0039, `tests/cli/failed-residue-guard.test.ts:426+`):
  - "startup re-check halts on persisted context + dirty tree" (`:428`).
  - "startup re-check on clean tree deletes file and proceeds" (`:474`).
  - "malformed persisted context warns and proceeds" (`:502` — asserts one `residue_context_unreadable` warning + file deleted).
  - "git-status failure during startup re-check halts" (`:530`).
  - "terminal-failure branch persists context to disk" (`:558` — asserts `contextExists` + persisted `issueId`/`cycleId`). This is the direct template for the new within-budget-arm persistence test, swapping `workflowYml(2, 1)` → `workflowYml(2, 2)`.
  - Store-level unit tests: `tests/engine/residue-context-store.test.ts`.
- Coverage policy: `src/cli.ts` is not in the per-file `FLOORS` table (`scripts/coverage-gate.mjs`); the global floors apply (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) and must not decrease. Report numbers in `BUILD.md`. `npm run typecheck` must be warning-free.

## Code References
- `src/cli.ts:866–871` — within-budget `drainRetry` arm; sets `pendingResidueContext` in memory only (the gap to close).
- `src/cli.ts:801–802`, `:858–859`, `:883–884`, `:670–671` — the four already-persisted set+`persistResidue` sites to mirror.
- `src/cli.ts:250–271` — `persistResidue` / `unpersistResidue` best-effort wrappers and their warning events.
- `src/cli.ts:312–328` — startup cross-process re-check.
- `src/cli.ts:596–617` — `haltIfResidue()` (clean-tree clear + `unpersistResidue()` at `:610–611`).
- `src/cli.ts:619–641` — `emitResidueHalt()`.
- `src/cli.ts:692–699` — loop-top residue gate.
- `src/engine/residue-context-store.ts:30–43` — `writeResidueContext` atomic write; `:49–80` `readResidueContext`; `:90–96` `deleteResidueContext`.
- `tests/cli/failed-residue-guard.test.ts:277` — within-budget retry halt test; `:558` — terminal-branch persistence test (templates for the new tests).
- `CLAUDE.md:128` — *Failed-cycle dirty-worktree residue guard* note; final sentence "The remaining limitation is that the within-budget retry arm is **not** persisted (in-process gate only)." — to be updated.
- `docs/ENGINE.md:76` — *Out of scope / known gaps* — "**Remaining known limitation:** the within-budget retry arm is **not** persisted to disk…" — to be updated; `docs/ENGINE.md:68` (three-gated-paths) and `:70` (cross-process persistence: "persists at the four terminal-failure branches") describe the current persist scope.

## Open Questions
- Whether the doc updates should narrow `docs/ENGINE.md:70` ("persists at the four terminal-failure branches") to reflect that persistence now also covers the within-budget retry arm (five persist sites), in addition to removing the "remaining known limitation" paragraph at `:76` and the CLAUDE.md sentence at `:128`. The plan step should decide the precise wording for all three doc surfaces.
- Whether a dedicated regression test is warranted for the clear-transition delete following a recovered within-budget retry (Acceptance Criteria item 5), or whether the existing clean-tree clear (`src/cli.ts:610–611`) and the success/noop drain delete tests already cover it without a within-budget-specific case.
