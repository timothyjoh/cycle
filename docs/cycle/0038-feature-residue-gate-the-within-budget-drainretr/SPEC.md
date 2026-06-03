# SPEC — Cycle 0038: Residue-gate the within-budget retry path

## WHY
The failed-cycle dirty-worktree residue guard (cycle 0036,
`src/engine/failed-residue-guard.ts` + `src/cli.ts`) arms its in-memory
`pendingResidueContext` only at the **terminal** failure branches — the
commit-failure branch, the fast-bail branch, and the budget-exhausted branch.
It does **not** arm it on the within-budget retry arm
(`else if (row.attempt + 1 < maxAttempts) { await drainRetry(...) }` at
`src/cli.ts:787`). Consequently a `spec`/`build`/`review` step that fails
mid-write — leaving uncommitted residue under `src/**`, `scripts/**`, or
`tests/**` — but still has retry budget remaining loops back to the top of the
`while (!halted)` supervisor loop with `pendingResidueContext` unset. The
loop-top `haltIfResidue()` is therefore a no-op for that iteration, and the
retry re-runs **on top of the dirty tree** — the exact failure mode the guard
was built to prevent (the cycles 0027/0028 incident where the engine "thrashed
across retries ... on the polluted tree"). This is currently documented in
`docs/ENGINE.md` as the recon-parity `drainRetry` gap but was never closed.

## CONCRETE USER BENEFIT
A user running the engine AFK can trust that a failed cycle with retry budget
left will **halt loudly** when it leaves uncommitted residue, instead of
silently stacking the retry attempt on top of the polluted tree and producing
corrupted, conflated diffs. After this cycle, a within-budget retry is
residue-gated exactly like resume and next-issue: the user sees a single
`engine.halted { reason: "failed_cycle_dirty_worktree" }` and a remediation
diagnostic on stderr the moment residue is detected — the engine stops cleanly
rather than thrashing.

## USABLE END-STATE
When a cycle's step fails with retry budget remaining and the failed attempt
left engine-non-owned residue in the worktree, the engine halts before
`drainRetry`'s re-run executes against the dirty tree. The halt is the same
single `engine.halted { reason: "failed_cycle_dirty_worktree", ... }` +
terminal `engine.stop` + stderr diagnostic + non-zero exit emitted by the two
existing gated sites (resume and loop-top). A clean-tree within-budget retry
proceeds byte-for-byte unchanged — no new event, no behavior change.

## Objective
Close the within-budget retry gap in the failed-cycle dirty-worktree residue
guard by arming `pendingResidueContext` on the within-budget retry arm in
`src/cli.ts`, so that the loop-top `haltIfResidue()` check sees residue left by
the just-failed attempt before `drainRetry` re-runs the cycle. This makes a
retry, like resume and next-issue, residue-gated — using the existing halt
event, exclusion semantics, and diagnostic, with no new halt reason.

## Source Issue
`refl-0036-drainretry-within-budget-retry-path-is-n-residue-gate-within-budget-retry` —
"Residue-gate the within-budget drainRetry path so retries never run on a dirty tree"

## Scope

### In Scope
- Arm `pendingResidueContext = { cycleId, issueId: row.id, failingStep }`
  on the within-budget retry arm (`else if (row.attempt + 1 < maxAttempts)`)
  in `src/cli.ts` before/around the `drainRetry` call, so the loop-top
  `haltIfResidue()` on the next iteration detects residue from the failed
  attempt and halts before the retry re-runs on the dirty tree.
- Add tests proving (a) a within-budget retry with non-engine-owned `src/**`
  residue halts with `failed_cycle_dirty_worktree` before `drainRetry` re-runs,
  and (b) a clean-tree within-budget retry proceeds unchanged with no new event.
- Update the `docs/ENGINE.md` *Failed-cycle dirty-worktree residue guard* note:
  the `drainRetry` within-budget recon-parity gap is now closed; narrow the
  documented remaining gap to cross-process restart re-check only.

### Out of Scope
- Cross-process persistence of the residue context across full engine restarts
  (recon's `.cycle/failed-residue-context.json` startup re-check) — explicitly
  the still-open recon-parity gap; not this cycle.
- Any change to the engine-owned exclusion predicate (`isEngineOwned`),
  `readFailedCycleResidue`, the porcelain parser, or the diagnostic formatter in
  `src/engine/failed-residue-guard.ts`.
- Any change to the two existing gated sites (resume-path and loop-top), the
  halt event shape, or `emitResidueHalt`.
- Introducing a new halt reason or a new pre-`drainRetry` check function.

## Requirements
- The within-budget retry arm must set `pendingResidueContext` with the
  failed cycle's `cycleId`, the issue's `row.id`, and the `failingStep`, mirroring
  the field shape armed at the terminal-failure branches.
- The existing engine-owned exclusion semantics must be preserved unchanged:
  `.cycle/**`, `docs/cycle/**`, and `isDenied` paths (including issue-lifecycle
  moves performed by `drainRetry`) must never trip the guard on a retry.
- On residue present at the loop top, the engine must emit exactly one
  `engine.halted { reason: "failed_cycle_dirty_worktree", failed_cycle_id,
  issue_id, dirty_paths, message }` + the terminal `engine.stop` + the
  `formatFailedCycleResidueDiagnostic` text on stderr + a non-zero exit — the
  same path as the existing two gated sites, with no new halt reason.
- `git status` non-zero must continue to halt (a failed check is never coerced
  to "clean"), via the unchanged `readFailedCycleResidue` throw → `haltIfResidue`
  catch path.
- **Failure behavior**: If the failed attempt left residue, the engine halts
  before `drainRetry` re-runs — residue is surfaced via `engine.halted` +
  stderr diagnostic + non-zero exit, never swallowed and never run on top of.
  If the residue check itself fails (`git status` non-zero / git missing), the
  engine halts with `message: "Residue check failed…"` and `dirty_paths: []`
  rather than proceeding on an unverified tree. A clean tree clears
  `pendingResidueContext` and the retry proceeds unchanged.

## Acceptance Criteria
- [ ] **(user-observable benefit)** A test simulating a within-budget retry
  (`row.attempt + 1 < maxAttempts`) where the failed attempt left uncommitted,
  non-engine-owned `src/**` residue halts with
  `engine.halted { reason: "failed_cycle_dirty_worktree" }` **before**
  `drainRetry` re-runs the cycle on the dirty tree — cardinality-pinned with
  `filter(...).length === 1`.
- [ ] The same halt path emits the terminal `engine.stop` (suppressing the
  epilogue's via `engineStopEmitted`, so exactly one `engine.stop` fires) and
  writes the remediation diagnostic to stderr.
- [ ] **(failure-path)** A within-budget retry where the residue check fails
  (`git status` non-zero) halts with `failed_cycle_dirty_worktree`,
  `dirty_paths: []`, and a `"Residue check failed…"` message rather than
  proceeding — the failed check is not coerced to "clean".
- [ ] A clean-tree within-budget retry proceeds byte-for-byte unchanged: no
  `engine.halted`/`engine.stop` residue event fires, and `drainRetry` re-runs as
  before.
- [ ] A within-budget retry whose only worktree changes are engine-owned
  (e.g. `docs/cycle/**` issue-lifecycle move performed by `drainRetry`,
  `.cycle/**` state) does **not** trip the guard.
- [ ] `docs/ENGINE.md` *Failed-cycle dirty-worktree residue guard* note states
  the within-budget `drainRetry` gap is closed and narrows the remaining
  recon-parity gap to cross-process restart only.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced.

## Testing Strategy
- Node's built-in `node:test` + `node:assert`, consistent with the existing
  `tests/engine/` and `tests/cli/` suites that drive the supervisor loop.
- Key scenarios:
  - **Happy path (gap closed):** within-budget retry + non-engine-owned `src/**`
    residue ⇒ single `failed_cycle_dirty_worktree` halt before `drainRetry`'s
    re-run; assert `step.start`/`cycle.start` for the retry attempt does **not**
    appear after the halt.
  - **Failure path:** `git status` non-zero during the within-budget retry's
    loop-top check ⇒ halt with empty `dirty_paths` and `"Residue check failed…"`.
  - **Regression / unchanged:** clean-tree within-budget retry ⇒ no new event,
    retry proceeds; engine-owned-only residue ⇒ no trip.
- Reuse existing residue-guard test harness/helpers from cycle 0036's tests
  where applicable; cardinality-pin all exactly-once engine events with
  `filter(...).length === 1`.
- No UI surface — no E2E/Playwright tests required.

## Documentation Updates
- **CLAUDE.md**: Update the *Failed-cycle dirty-worktree residue guard* summary
  line under *Workflow defaults* — remove the "within-budget `drainRetry` path
  is **not** residue-gated (recon-parity gap)" caveat; state the within-budget
  retry path is now gated and the remaining recon-parity gap is cross-process
  restart only.
- **docs/ENGINE.md**: Update the *Failed-cycle dirty-worktree residue guard*
  section to document the within-budget retry as a third gated site and narrow
  the recon-parity gap to cross-process restart re-check.
- **README.md**: No user-facing surface change — the guard is internal engine
  behavior; no README update required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- `src/engine/failed-residue-guard.ts` (cycle 0036) — `readFailedCycleResidue`,
  `isEngineOwned`, `formatFailedCycleResidueDiagnostic`, `ResidueContext`.
- The `src/cli.ts` supervisor's existing `pendingResidueContext`,
  `haltIfResidue`, `emitResidueHalt`, `engineStopEmitted`, and `drainRetry`
  machinery (cycle 0036).
- No new external services or env vars.
