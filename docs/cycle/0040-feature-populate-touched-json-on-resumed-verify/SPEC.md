# SPEC — Cycle 0040: Populate touched.json on Resumed / Verify-Only Builds

## WHY
`touched.json` is the cycle's footprint record — the set of `src/`/`scripts/` files the build legitimately touched. `commitCycle` reads it and emits a `commit.scope_warning` for any staged `src/`/`scripts/` file that is **absent** from that set, so an operator running AFK can spot scope drift (the agent quietly editing files outside the cycle's mandate).

That signal only works when `touched.json` reflects reality. Today it is written **only** as a side-effect of a `build`/`fix`/`final_fix`/`quick_fix`/`test_fix`/`test_build` step actually executing in-process: `accumulateTouchedFiles` runs solely under `if (r.status === "ok" && RESET_ELIGIBLE_STEPS.has(step.name))` (`src/engine/run-cycle.ts:729`). When a cycle **resumes at a step index past the build** (`opts.resume.startStepIndex`, set via `--resume-from-step`), the build loop iteration is skipped entirely, `accumulateTouchedFiles` never runs, and `touched.json` is left empty or absent. The `commitCycle` consumer (`src/engine/commit-cycle.ts:164-193`) then compares every staged `src/`/`scripts/` file against an **empty** set, so the scope warning either fires on everything (pure noise) or — when the prior attempt already committed the work — silently degrades. Either way the footprint signal is meaningless precisely on the resume/verify-only paths an AFK operator most relies on.

## CONCRETE USER BENEFIT
An operator who resumes a cycle past its build step (a `--resume-from-step` re-run, e.g. to re-do only `review`/`final_verify` without rebuilding) gets a `touched.json` that reflects the real files the build touched — reconstructed from the build's own declared footprint — so `commit.scope_warning` continues to flag only genuinely out-of-scope files instead of warning on every file or none. The footprint/scope-drift signal survives a resume; it is no longer silently blinded by an empty set.

## USABLE END-STATE
After this cycle, running a cycle with `--resume-from-step <index past build>` produces a non-empty `touched.json` (when the build's footprint is recoverable) in `docs/cycle/<cycleId>-<workflow>-<slug>/`, and the engine log records that the footprint was reconstructed (and from which source). The operator reading the log sees that scope warnings on the resumed run are computed against the real touched set, not an empty one.

## Objective
Reconstruct `touched.json` on the resume/verify-only path so the footprint record stays meaningful when the build step does not re-execute in the current process. On entering `runCycle` with a resume start index that sits past any executed `RESET_ELIGIBLE_STEPS` step — i.e. the build won't run this process — the engine recovers the touched set from the build's already-written record (`BUILD.md`'s `## Touched Files` section, the canonical declared footprint), merges in any currently-uncommitted in-scope paths, and writes the result to `touched.json` before `commitCycle` consumes it. Recovery is best-effort and observable: it emits a log event naming its source and count, and a warning when no footprint is recoverable, rather than silently leaving an empty file.

## Source Issue
`txt-20260601-220001-touched-json-resumed-verify-builds` — "Populate touched.json on resumed/verify-only builds so scope warnings stay meaningful"

## Scope

### In Scope
- A recovery helper (`recoverTouchedFiles` in `src/engine/run-cycle.ts`, or a sibling module) that reconstructs the touched set from `BUILD.md`'s `## Touched Files` section — reusing the existing parse logic in `appendDocumentationPaths` (`run-cycle.ts:116-124`) and the `isDenied` filter — unions it with the current `git status --porcelain` in-scope paths, merges with any existing `touched.json` content, and writes the sorted/deduped `{ files }` schema. It emits `touched.recovered { cycle_id, source, count }` on success and an `engine.warning { reason: "touched_recovery_empty", cycle_id }` when it runs but finds no recoverable footprint.
- Wiring it into the resume path: when `opts.resume` is set and `startStepIndex` is past every `RESET_ELIGIBLE_STEPS` step in the workflow (so no build/fix step executes this process), invoke the recovery once before the cycle reaches commit, only if `touched.json` is absent or its `files` array is empty (never clobber a populated footprint).
- Tests covering (a) the resumed/skip-completed path (resume past build → `touched.json` populated from `BUILD.md`) and (b) the verify-only re-run path (build already committed, working tree clean → `touched.json` still populated from the recovered footprint), plus the failure/degrade paths.

### Out of Scope
- Changing `commit.scope_warning` semantics, format, or the (non-blocking) commit behavior in `commit-cycle.ts`.
- Recovering the footprint via base-branch `git diff --name-only <base>...HEAD`. `BUILD.md`'s declared `## Touched Files` is the mode-agnostic canonical record and is sufficient; base-ref diffing is workflow-mode-dependent and deferred.
- The documented bash-`build`-step exclusion and the hardcoded-`RESET_ELIGIBLE_STEPS` limitations (`docs/ENGINE.md:228,230`).
- Any change to the normal (non-resumed) build path, where `accumulateTouchedFiles` already populates `touched.json`.

## Requirements
- On a resume whose `startStepIndex` is past all `RESET_ELIGIBLE_STEPS` steps, `touched.json` is populated with the reconstructed touched set before `commitCycle` reads it, when that set is recoverable.
- Recovery reuses the existing `## Touched Files` parser and the `isDenied` denylist filter; the output schema is unchanged (`{ "files": string[] }`, sorted, deduplicated, repo-root-relative).
- Recovery never overwrites an already-non-empty `touched.json` (idempotent; the normal-build write wins).
- The normal (non-resumed) build path is byte-for-byte unchanged — `accumulateTouchedFiles` still owns footprint accumulation when the build executes.
- **Non-functional:** recovery adds at most one `BUILD.md` read and one `git status --porcelain` spawn on the resume path; no new spawn on the normal path.
- **Failure behavior:** recovery is best-effort and never fails the cycle. On a missing/unreadable `BUILD.md`, an absent `## Touched Files` header, or a non-zero `git status`, it leaves `touched.json` unchanged and emits `engine.warning { reason: "touched_recovery_empty", cycle_id }` so the empty footprint is observable in the log rather than silently swallowed. A write failure to `touched.json` is caught, emits the same-shaped warning (`reason: "touched_recovery_write_failed"`), and does not mask the cycle outcome. Recovery is skipped (no event) when `touched.json` is already non-empty.

## Acceptance Criteria
- [ ] Resuming a cycle with `--resume-from-step` at an index past the build step produces a non-empty `touched.json` whose `files` array equals the in-scope paths recovered from `BUILD.md`'s `## Touched Files` section (the user-observable benefit: footprint survives the resume).
- [ ] On the verify-only path (build already committed, `git status --porcelain` clean), `touched.json` is still populated from the recovered footprint rather than left empty.
- [ ] A `touched.recovered { cycle_id, source, count }` event is emitted exactly once on a successful recovery (cardinality-pinned with `filter(...).length === 1`).
- [ ] **Failure path:** when the build step never ran in-process AND no footprint is recoverable (no `BUILD.md` / no `## Touched Files` header), `touched.json` is left unchanged and exactly one `engine.warning { reason: "touched_recovery_empty" }` is emitted — no crash, the cycle proceeds.
- [ ] Recovery does not overwrite an already-non-empty `touched.json` (running it against a populated file is a no-op that emits no recovery event).
- [ ] The normal (non-resumed) build path emits no new event and writes `touched.json` exactly as before.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced; `npm run typecheck` clean.

## Testing Strategy
- Framework: `node:test` with the existing `tests/engine/` harness conventions and `tests/helpers.ts` (`expectExactlyOne` for the exactly-once recovery event).
- Happy path: seed an artifact dir with a `BUILD.md` containing a `## Touched Files` block; run `runCycle` with `resume.startStepIndex` past the build; assert `touched.json` contents and the `touched.recovered` event.
- Verify-only path: same seed but with a clean working tree (changes pre-committed); assert recovery still populates from `BUILD.md`.
- Failure paths: (a) no `BUILD.md` → `touched_recovery_empty` warning, file untouched; (b) `BUILD.md` present but no `## Touched Files` header → same warning; (c) `touched.json` already populated → no event, no clobber.
- Regression: a normal (non-resume) `feature` run still writes `touched.json` via `accumulateTouchedFiles` with no new event.
- Coverage: `npm run test:coverage`; `src/engine/run-cycle.ts` stays within its 90% per-file floor and the new recovery code paths (success, each degrade branch) are exercised. Report Line/Branch/Function numbers in `BUILD.md` per the coverage policy.

## Documentation Updates
- **docs/ENGINE.md → *touched.json footprint***: document the resume/verify-only recovery path — trigger condition (resume past all `RESET_ELIGIBLE_STEPS` steps, `touched.json` empty/absent), source (`BUILD.md`'s `## Touched Files`), the `touched.recovered` / `touched_recovery_empty` / `touched_recovery_write_failed` events, and that a populated footprint is never clobbered.
- **CLAUDE.md**: extend the `src/engine/run-cycle.ts` architecture note to mention resume-path footprint recovery alongside the existing `accumulateTouchedFiles` description.
- **README.md**: no user-facing CLI surface change — no update required.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `appendDocumentationPaths` `## Touched Files` parser and `parseSnapshotPaths` / `isDenied` helpers in `src/engine/run-cycle.ts` and `src/engine/path-utils.ts`.
- The build prompt (`src/defaults/prompts/build.md`) already instructs the agent to write a `## Touched Files` section in `BUILD.md` — the recovery source.
- `RunCycleOpts.resume.startStepIndex` and `RESET_ELIGIBLE_STEPS`, already present in `run-cycle.ts`.
- No new external services or env vars.
