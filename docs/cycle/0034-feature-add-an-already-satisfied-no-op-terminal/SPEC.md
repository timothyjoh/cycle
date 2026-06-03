# SPEC — Cycle 0034: No-op terminal cycle resolution (build-phase fallback)

## WHY
An issue whose work is **already fully satisfied** in the codebase is currently
forced into a failure loop. The build/fix empty-diff post-condition in
`src/engine/run-cycle.ts` (~lines 653–662) sets `r.status="failed"` with
`formatEmptyDiffGuardError` whenever `git status --porcelain -- src scripts
tests` is empty. So when the agent correctly concludes that no change is
warranted — the SPEC is already met, it can cite file:line, and it refuses to
fabricate edits — the cycle fails, retries up to `max_cycle_attempts`,
terminally lands in `docs/cycle/issues/failed/` for the **wrong reason** (it is
DONE, not failed), and each terminal failure counts toward
`engine.max_consecutive_failures`, creating a halt risk. This is real: cycle
0025 / `refl-0024-walkthrough-hook-spawn-has-no-timeout` was moot because cycle
0024 had already built the timeout in. Reflection and triage will keep
producing already-satisfied issues, and every one burns the failure budget.

## CONCRETE USER BENEFIT
After this cycle, when a user (or reflection/triage) queues an issue whose work
is already done, the engine resolves it to a distinct **no-op terminal outcome**
instead of a failure: the issue moves to the terminal lane with a recorded
reason, the run does **not** burn the consecutive-failure budget, and the
operator can see in `.cycle/log.jsonl` that the cycle was a recognized no-op
(`cycle.noop`) rather than a genuine failure. An overnight AFK run no longer
risks halting because reflection produced a few already-satisfied issues.

## USABLE END-STATE
A queued, already-satisfied issue runs through spec → research → plan → build.
The build agent concludes no change is warranted, emits a `NOOP.md` marker
carrying a reason category plus per-SPEC-requirement file:line evidence, and
makes no edits. The engine sees the marker alongside the empty diff, classifies
the cycle as a no-op, emits `cycle.noop`, moves the issue to the terminal lane,
does **not** retry, and does **not** increment `consecutive_failures`. With **no**
marker present, the empty diff still fails exactly as today (anti-slop
preserved).

## SCAFFOLDING ESCAPE HATCH
Not applicable — this round delivers a direct, user-observable benefit (an
already-satisfied issue resolves cleanly instead of failing). The
research-phase **early rejection** short-circuit named in the source issue is a
pure efficiency optimization layered on this same machinery; it is deferred to a
sibling cycle (see Out of Scope).

## Objective
Add a terminal "already-satisfied / no-op" cycle resolution distinct from
failure, detected at the **build phase**: the existing build/fix empty-diff guard
routes to a no-op terminal outcome **only when a `NOOP.md` marker with
per-requirement evidence is present**, and otherwise fails exactly as before.
The no-op outcome emits a distinct event, moves the issue to a terminal lane, and
is invisible to the consecutive-failure budget and the retry loop. This fixes the
documented failure-loop bug for moot issues while keeping the empty-diff guard as
a strict anti-slop check for the unmarked case.

## Source Issue
`txt-20260601-220000-noop-already-satisfied-rejection-path` — "Add an
already-satisfied / no-op terminal cycle resolution (research early-reject +
build fallback)"

## Scope

### In Scope
- **Engine no-op resolution (build/fix guard).** At the empty-diff guard in
  `src/engine/run-cycle.ts`, when the build/fix step exits 0, the diff is empty,
  AND a `NOOP.md` marker is present in the artifact dir with a valid reason
  category and at least one file:line evidence line, classify the cycle as a
  no-op: emit `cycle.noop { cycle_id, issue_id, reason, detected_at_step }`,
  emit `cycle.end { status: "noop" }`, and return a `noop` cycle result. Marker
  **absent** (or malformed) ⇒ current `formatEmptyDiffGuardError` failure
  preserved byte-for-byte. Wire the supervisor (`src/cli.ts`) to route the no-op
  result to a terminal-lane drain that does **not** retry and does **not**
  increment `consecutiveFailures`/`failedCycles`, flowing through the normal
  `finally`/checkout/base-pull cleanup.
- **Build prompt marker emission.** Edit `prompts/build.md` (and `prompts/fix.md`
  if the empty-diff guard applies to the fix step) so the agent, when it
  determines the SPEC is already satisfied, writes `NOOP.md` (reason category +
  per-requirement file:line evidence) instead of fabricating edits. Run
  `npm run sync-defaults` to propagate `src/defaults/` → `.cycle/`.
- **Completion-proof / artifact reconciliation.** Adjust `STEP_ARTIFACTS` /
  completion-proof handling so a no-op build does not trip the artifact
  post-condition or the empty-diff guard contradictorily, and so `NOOP.md` is
  recognized as a legitimate terminal artifact for the step.

### Out of Scope
- **Research-phase early rejection short-circuit** — detecting the moot issue in
  the research step and skipping plan/build/review. Deferred to a sibling cycle;
  this cycle's build-phase fallback already guarantees correct resolution.
- A new dedicated `obsolete/` / `superseded/` lifecycle lane — this cycle reuses
  the existing terminal lane (see Dependencies / Requirements); a separate lane
  is a future refinement if desired.
- Changing the unmarked empty-diff failure behavior in any way.

## Requirements
- The no-op classification fires **only** when all of: build/fix exit 0, empty
  `git status --porcelain -- src scripts tests`, and a present, well-formed
  `NOOP.md` marker (recognized reason category ∈ `already-satisfied | duplicate
  | not-actionable`, plus ≥1 file:line evidence line).
- `cycle.noop` is emitted **exactly once** per no-op cycle, carrying
  `cycle_id`, `issue_id`, `reason`, and `detected_at_step` (`"build"` or
  `"fix"`).
- A no-op cycle moves its issue to the terminal lane (`done/`) and records the
  reason; the supervisor does **not** retry it and does **not** increment
  `consecutive_failures` or append to `failedCycles`.
- The marker-absent empty-diff path produces the identical
  `formatEmptyDiffGuardError` failure and routing as before this cycle.
- The no-op early return flows through the existing `finally` checkout/base-pull
  cleanup unchanged.
- **Failure behavior**: A *malformed* `NOOP.md` (missing/unrecognized reason
  category, or zero file:line evidence lines) does **not** qualify as a no-op —
  it falls through to the existing empty-diff failure so a slop marker can never
  smuggle a fabricated "done". An unreadable/absent marker is treated as absent
  (failure preserved). If the terminal-lane move fails (I/O error), the error is
  surfaced (logged/raised) and the cycle does not silently report success. The
  `cycle.noop` classification must never be swallowed: any internal error in the
  marker check degrades to the existing failure path rather than masking the
  outcome.

## Acceptance Criteria
- [ ] **(User-observable benefit)** Running a cycle whose build step exits 0,
      produces an empty `src/scripts/tests` diff, and writes a valid `NOOP.md`
      results in the issue landing in `docs/cycle/issues/done/` (not `failed/`)
      and `consecutive_failures` is unchanged from before the cycle.
- [ ] A `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` event is
      emitted exactly once for a no-op cycle (cardinality-pinned via
      `filter(...).length === 1` / `expectExactlyOne`), followed by `cycle.end
      { status: "noop" }`.
- [ ] **(Failure path)** With an empty diff and **no** `NOOP.md` marker, the
      cycle fails with `formatEmptyDiffGuardError` and routes through the
      existing retry/terminal-failure path — state and event sequence identical
      to pre-cycle behavior (regression-pinned).
- [ ] **(Failure path)** A *malformed* `NOOP.md` (no recognized reason category
      or zero file:line evidence lines) does NOT classify as a no-op — it falls
      through to the empty-diff failure.
- [ ] A no-op cycle does not trip the build/fix completion-proof / artifact
      post-condition (no spurious `step.completion_check { status: "fail" }`).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced; per-file coverage floors
      (`src/engine/run-cycle.ts` ≥ 90%, plus any touched module floors) met.

## Testing Strategy
- Node built-in test runner (`node:test`), consistent with `tests/engine/`.
- Key scenarios:
  - **Happy no-op**: build exit 0 + empty diff + valid `NOOP.md` ⇒ `cycle.noop`
    (exactly once), `cycle.end {status:"noop"}`, issue moved to `done/`, no
    `consecutive_failures` increment, no retry.
  - **Marker absent**: empty diff + no marker ⇒ existing
    `formatEmptyDiffGuardError` failure and terminal/retry routing unchanged.
  - **Malformed marker**: present but missing reason category / zero evidence
    ⇒ falls through to failure (anti-slop preserved).
  - **Reason propagation**: each recognized reason category surfaces verbatim in
    `cycle.noop.reason` and `detected_at_step`.
  - **Cleanup**: the no-op early return still performs checkout/base-pull
    (`finally`) as for the ok/failed paths.
  - **Supervisor accounting**: `consecutiveFailures`/`failedCycles` untouched and
    no `drainRetry`/`terminalDrain`-to-`failed/` invoked for a no-op.
- All exactly-once engine-event assertions cardinality-pinned per repo
  convention.

## Documentation Updates
- **CLAUDE.md**: document the `cycle.noop` event, the marker-gated no-op
  resolution at the build/fix empty-diff guard, the chosen terminal lane
  (`done/`), and the "marker absent ⇒ failure preserved" anti-slop contract in
  the `run-cycle.ts` notes and the Workflow defaults section.
- **docs/ENGINE.md**: add a *No-op / already-satisfied resolution* section
  describing the detection condition, marker schema (reason category +
  per-requirement file:line evidence), event payload, lifecycle move, and the
  no-retry / no-`consecutive_failures` semantics.
- **README.md**: no user-facing CLI surface change in this cycle (note explicitly
  if any flag/behavior becomes observable).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing empty-diff guard and `formatEmptyDiffGuardError` in
  `src/engine/run-cycle.ts` (~lines 653–662).
- `STEP_ARTIFACTS` / `ARTIFACT_STEPS` / completion-proof machinery in
  `src/engine/run-cycle.ts`.
- Supervisor accounting in `src/cli.ts` (`consecutiveFailures`, `failedCycles`,
  `drainRetry`, `terminalDrain`) and the cycle-result/log-tail read path
  (`readCycleEndFailure`) used to classify the outcome.
- `terminalDrain` / lifecycle helpers in `src/engine/issue-lifecycle.ts` and the
  existing `docs/cycle/issues/done/` terminal lane.
- `npm run sync-defaults` to propagate prompt edits from `src/defaults/` to
  `.cycle/`.
- No external services or env vars required.
