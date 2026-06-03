I have sufficient context to write the research document.

```markdown
# Research: Cycle 0039

## Cycle Context
SPEC.md asks to close the cross-process gap in the failed-cycle dirty-worktree residue guard. Today the guard's `pendingResidueContext` (`src/cli.ts`) lives only in memory and is armed exclusively at terminal-failure branches within a single long-running supervisor process; after a cycle ends in terminal failure (`cycle.end {status:"failed"}` present in the log, so no in-flight tail) a full engine restart finds nothing to arm the guard and pops the next pending issue on top of any uncommitted residue with no check. The cycle must add a persistence module that writes the residue context to `.cycle/failed-residue-context.json` at every terminal-failure branch, re-checks the worktree against that persisted context exactly once at engine start (after lock/config load + `engine.start`, before triage and before the resume/loop work), and clears the file on the same success/noop/clean-tree transitions that clear the in-memory copy — degrading malformed/unreadable JSON to "no pending context" with an `engine.warning` rather than a silent proceed, and reusing the existing `haltIfResidue()`/`emitResidueHalt()` machinery unchanged so emitted payloads and the stderr diagnostic are byte-identical to the in-process gate. Documentation caveats in `docs/ENGINE.md` and `CLAUDE.md` must be corrected.

## Current Codebase State

### Relevant Components
- Residue guard core (pure-leaning module): `parseDirtyPaths`, `isEngineOwned`, `readFailedCycleResidue`, `formatFailedCycleResidueDiagnostic`, and the `ResidueContext` type — `src/engine/failed-residue-guard.ts:1-81`. SPEC declares these reused **unchanged**; the new startup re-check feeds them.
- `ResidueContext` shape: `{ cycleId: string; issueId: string; failingStep: string | undefined }` — `src/engine/failed-residue-guard.ts:4-8`. This is the data the persisted JSON file must carry (at least `cycleId`, `issueId`, `failingStep`).
- `readFailedCycleResidue(cwd)` — `src/engine/failed-residue-guard.ts:52-64`: runs `git status --porcelain --untracked-files=all` via `spawnSync` (array args, `shell:false`); **throws** on non-zero exit (never coerces a failed check to "clean"); filters out `isEngineOwned` paths; returns `{ stdout, paths }` (deduped, sorted).
- `isEngineOwned(p)` — `src/engine/failed-residue-guard.ts:39-45`: reuses `isDenied` (`src/engine/path-utils.ts`) and layers the whole `.cycle/**` and `docs/cycle/**` trees. The new `.cycle/failed-residue-context.json` lives under `.cycle/**`, so it is already excluded and can never itself trip the guard (a Requirement).
- Supervisor wiring — `src/cli.ts`. Key structures:
  - In-memory guard state declared at `src/cli.ts:292-293`: `let pendingResidueContext: ResidueContext | undefined;` and `let engineStopEmitted = false;`.
  - `haltIfResidue()` — `src/cli.ts:527-547`: no-op when `pendingResidueContext` is unset; on `git`-status throw emits a halt with `dirty_paths: []` and `message: "Residue check failed after cycle <id>: <err>"`; clean tree clears the context and returns `false`; residue present formats the diagnostic, emits the halt, returns `true`.
  - `emitResidueHalt(ctx, dirtyPaths, message)` — `src/cli.ts:549-571`: emits exactly one `engine.halted {reason:"failed_cycle_dirty_worktree", failed_cycle_id, issue_id, dirty_paths, message}`, one terminal `engine.stop {status:"halted", reason:"failed_cycle_dirty_worktree", halted_at_issue, failing_step}`, sets `engineStopEmitted = true`, writes `message + "\n"` to `process.stderr`.

### Existing Patterns to Follow
- **Engine-start region (where the startup re-check must be inserted).** `src/cli.ts:184-266` is the bootstrap sequence in order: lock acquire (`acquireLock(lockPath)`, `src/cli.ts:186`) → logger (`src/cli.ts:195`) → SIGTERM handlers (`src/cli.ts:192-206`) → issue-dir mkdirs (`src/cli.ts:208-213`) → `loadDotEnv` + `loadConfig` (`src/cli.ts:216-217`) → `engine.start` emit (`src/cli.ts:223`) → preflight gate (`src/cli.ts:225-253`) → `runTriage` (`src/cli.ts:255-266`). The resume-from-tail block begins at `src/cli.ts:573` and the `while (!halted)` loop at `src/cli.ts:617`. SPEC requires the startup re-check run **after** `engine.start`/lock/config and **before** `runTriage` and the resume block (i.e. between `src/cli.ts:223` and `:255`).
- **In-memory guard already runs at two sites** (to be joined by a third startup site): before `runResumeOnce` (`src/cli.ts:581`, armed from the log tail at `:580`) and at the top of the `while (!halted)` loop (`src/cli.ts:621-625`, before `popNextPending` at `:637`).
- **Terminal-failure branches that set `pendingResidueContext`** (every site that must also persist the file):
  - Resume terminal path: `src/cli.ts:598`.
  - Commit-failed (attempts exhausted): `src/cli.ts:725`.
  - Fast-bail (iteration-too-fast): `src/cli.ts:780`.
  - Attempts-exhausted exec failure: `src/cli.ts:804`.
  - Within-budget retry arm: `src/cli.ts:792` (out of scope to change behavior, but it also *sets* the context — SPEC scopes persistence to terminal-failure branches; the retry arm is a within-process gate already closed in cycle 0038).
- **Clear sites that set `pendingResidueContext = undefined`** (every site that must also delete the file): resume-ok `src/cli.ts:591`; resume-noop `:606`; resume skipped/retry `:609`; clean-tree inside `haltIfResidue()` `:541`; noop drain `:699`; success drain `:741`.
- **Atomic state-file write pattern.** Queue persistence writes to a `path + ".tmp"` then `rename`s into place — `src/engine/queue.ts:122-126`. This is the established "crash mid-write does not leave a half-file" idiom the persistence module's Requirement points at.
- **Tolerant state-file read pattern (ENOENT degrade).** `loadDotEnv` reads a file, catches the error, returns silently on `ENOENT`, and rethrows other codes — `src/engine/dot-env.ts:8-36`. It also exposes an injectable `ReadFileFn` seam (`src/engine/dot-env.ts:3-6`) for fault tests. This is the pattern for "missing file ⇒ no context; malformed ⇒ degrade" reads.
- **PID-lockfile read/write/unlink helper module shape.** `src/engine/engine-lock.ts:1-40` shows a small `src/engine/`-resident module with an injectable `LockDeps` seam and `readFileSync`/`writeFileSync`/`unlinkSync` from `node:fs` — a precedent for a self-contained persistence module with a default-deps seam.
- **Failure handling today.** The guard's only failure mode is `git status` non-zero: `readFailedCycleResidue` throws (`src/engine/failed-residue-guard.ts:58-61`), `haltIfResidue`'s `catch` arm (`src/cli.ts:534-539`) converts that into a halt with empty `dirty_paths` — never a silent proceed. SPEC requires the startup re-check route a `git status` failure through this same halt discipline.
- **Observability conventions.** Structured events via `log.emit(event, payload)` into `.cycle/log.jsonl`. Relevant events: `engine.halted`, `engine.stop`, `engine.warning` (existing reasons include `noop_reason_unreadable` at `src/cli.ts:695`). SPEC asks for an `engine.warning {reason: "residue_context_unreadable"}` (or equivalent) on malformed-file degrade and best-effort write/delete failures. `engineStopEmitted` (`src/cli.ts:293`, set at `:569`, checked at `:827`) enforces exactly-one terminal `engine.stop`.
- **Cardinality discipline.** Per `CLAUDE.md` Test conventions, exactly-once engine events are pinned with `filter(predicate).length === 1`. The existing residue tests follow this; the new startup `engine.halted`/`engine.stop` emits must too.
- **Idempotency / retry-safety mechanisms present.** Single-engine exclusion via the PID lockfile (`acquireLock`/`releaseLock`, `src/cli.ts:186-191`, `src/engine/engine-lock.ts`); resume-from-tail dedup keyed on in-flight cycle (`readLogTail`, `src/cli.ts:574`); the in-memory residue guard itself. The new state file is engine-owned (`.cycle/`), excluded by `isEngineOwned`, so it is retry-safe against the guard it feeds.

### Dependencies & Integration Points
- `src/engine/failed-residue-guard.ts` exports — reused unchanged by the startup re-check: `readFailedCycleResidue`, `formatFailedCycleResidueDiagnostic`, `isEngineOwned`, `ResidueContext` (imported into `src/cli.ts:30-34`).
- `src/cli.ts` supervisor internals reused: `pendingResidueContext`, `haltIfResidue()`, `emitResidueHalt()`, `engineStopEmitted`, the post-lock/`loadConfig` startup region around `engine.start` (`src/cli.ts:223`), and every terminal-failure branch.
- `.cycle/` directory exists at runtime (engine-owned, created by engine init). The lock file already lives at `join(cwd, ".cycle", "engine.lock")` (`src/cli.ts:184`); the new state file would sit alongside it. No external services or env vars required.
- `node:fs` / `node:fs/promises` for the read/write/delete. Note `CLAUDE.md` Test conventions: `node:fs/promises` cannot be stubbed via `mock.method` (non-configurable ESM exports); use `node:fs` for `mock.method` interception, or real filesystem manipulation, for any fault test.
- `loadConfig` (`src/cli.ts:217`, `src/engine/workflow.ts`) precedes the insertion point and is unaffected.

### Test Infrastructure
- **Test framework:** `node:test` + `node:assert/strict`, run via `npm run test:coverage` (auto-builds; enforces per-file coverage floors via `scripts/coverage-gate.mjs` and structural invariants via `scripts/structural-invariants.mjs`).
- **Existing unit tests for the guard:** `tests/engine/failed-residue-guard.test.ts` — real-git-repo helpers `git(cwd, args)` and `makeRepo()` (`tests/engine/failed-residue-guard.test.ts:13-29`), then cases for `parseDirtyPaths`, `isEngineOwned`, `readFailedCycleResidue`, `formatFailedCycleResidueDiagnostic` (`:31-40+`). This is the model for the new persistence module's round-trip / missing / malformed / delete-missing unit tests.
- **Existing supervisor/integration tests:** `tests/cli/failed-residue-guard.test.ts` — runs the built `dist/cycle.js` against a bootstrapped temp repo (`ensureDist` `:9-13`; `bootstrapRepo` `:15-44` writes `.cycle/workflows.yml`, scripts, and the issue-dir tree; `seedTodo` `:45-72` seeds a todo + `tbd.jsonl` row; `workflowYml` `:74+` builds a trunk-mode `engine` config). Existing cases (`tests/cli/failed-residue-guard.test.ts:123-381`):
  - loop path halts before popping next issue (`:123`)
  - resume path halts before `runResumeOnce` (`:168`)
  - engine-owned-only residue does not halt (`:211`)
  - clean tree leaves behavior unchanged / no new event (`:234`)
  - within-budget retry halts before `drainRetry` re-runs (`:259`)
  - within-budget retry with git-status failure halts (`:304`)
  - clean-tree within-budget retry proceeds unchanged (`:330`)
  - engine-owned-only within-budget retry does not trip (`:360`)
  - git-status failure halts / no silent proceed (`:381`)
  These mirror the new integration tests SPEC requires (happy-path-of-failure restart, clean restart, malformed context, git-status failure during startup re-check, clear-on-success/noop).
- **Current coverage of the change area / failure-path coverage:** `src/engine/failed-residue-guard.ts` carries a **100% per-file floor** in the coverage gate — `scripts/coverage-gate.mjs:36` (`"src/engine/failed-residue-guard.ts": 100`). The `FLOORS` table is the place to register a floor for any new `src/engine/` persistence module (`scripts/coverage-gate.mjs:12`, `:36`, `:79`). Failure-path tests already exist (git-status failure cases at `tests/cli/failed-residue-guard.test.ts:304`, `:381`).

## Code References
- `src/engine/failed-residue-guard.ts:4-8` — `ResidueContext` type; the persisted JSON payload shape.
- `src/engine/failed-residue-guard.ts:39-45` — `isEngineOwned`; `.cycle/**` exclusion that covers the new state file.
- `src/engine/failed-residue-guard.ts:52-64` — `readFailedCycleResidue`; throws on git non-zero (reused by startup re-check).
- `src/cli.ts:184-266` — engine-start bootstrap region; insertion point for the startup re-check is after `engine.start` (`:223`) and before `runTriage` (`:255`).
- `src/cli.ts:292-293` — `pendingResidueContext` / `engineStopEmitted` declarations.
- `src/cli.ts:527-547` — `haltIfResidue()`.
- `src/cli.ts:549-571` — `emitResidueHalt()`.
- `src/cli.ts:573-614` — resume-from-tail block (in-flight tail only; the gap this cycle closes — terminal-failure cycles have no tail here).
- `src/cli.ts:617-625` — `while (!halted)` loop-top residue gate.
- `src/cli.ts:591, 606, 609, 699, 741` — clear sites (`pendingResidueContext = undefined`) that must also delete the state file.
- `src/cli.ts:598, 725, 780, 792, 804` — set sites (`pendingResidueContext = {…}`) that must also write the state file.
- `src/cli.ts:695` — existing `engine.warning {reason:"noop_reason_unreadable"}`; precedent for the `residue_context_unreadable` warning.
- `src/cli.ts:816-838` — halt epilogue; `engineStopEmitted` check (`:827`) preserves exactly-one terminal `engine.stop`.
- `src/engine/queue.ts:122-126` — tmp-file + rename atomic-write idiom.
- `src/engine/dot-env.ts:8-36` — tolerant read with ENOENT degrade + injectable `ReadFileFn` seam.
- `src/engine/engine-lock.ts:1-40` — small `src/engine/` state-helper module with injectable deps; `unlinkSync` usage for delete.
- `scripts/coverage-gate.mjs:12,36,79` — `FLOORS` table; register a floor for any new module.
- `docs/ENGINE.md:60-72` — *Failed-cycle dirty-worktree residue guard* section; line 72 carries the "no cross-process persistence … sole deferred recon-parity item" caveat to be corrected.
- `CLAUDE.md` *Failed-cycle dirty-worktree residue guard* bullet — carries the "sole remaining recon-parity gap is cross-process persistence … not implemented (in-process only)" sentence to be replaced.

## Open Questions
- **Persistence-module location and name.** SPEC says "a persistence module" under `src/engine/`; whether it is a new file (e.g. `src/engine/residue-context-store.ts`) or added to `failed-residue-guard.ts` (which has a 100% floor at `scripts/coverage-gate.mjs:36`) is a planner decision. A new file needs its own `FLOORS` entry.
- **Write/delete API surface and injectable seam.** Whether to mirror `dot-env.ts`'s `ReadFileFn` seam and/or `engine-lock.ts`'s deps object for fault tests, given the `node:fs/promises` mock limitation noted in `CLAUDE.md` (use `node:fs` for `mock.method`, or real-fs manipulation).
- **Exact `engine.warning` reason string.** SPEC suggests `residue_context_unreadable` for the malformed-file degrade; the same or distinct reasons for best-effort write-failure and delete-failure paths are to be finalized in planning.
- **Startup re-check vs. the resume-from-tail block interaction.** The startup re-check runs before the resume block (`src/cli.ts:573`); confirm the precedence/ordering so a persisted context and an in-flight tail (if both somehow present) do not double-arm or conflict.
- **Whether the within-budget retry set site (`src/cli.ts:792`) should also persist.** SPEC scopes persistence to "terminal-failure branches"; the retry arm is an in-process gate (cycle 0038) and is listed Out of Scope — confirm it is intentionally excluded from the persist set.
```
