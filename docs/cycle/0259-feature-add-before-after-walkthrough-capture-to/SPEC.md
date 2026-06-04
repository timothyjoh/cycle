# SPEC — Cycle 0259: Before/After Walkthrough Capture for the quickfix Workflow

## WHY
The `feature` workflow can capture a recorded walkthrough of the delivered change via the optional, repo-agnostic walkthrough hook. The `quickfix` workflow — used for surgical bug fixes — has no equivalent. For a bug fix, the single most valuable evidence is a *before* recording of the broken behavior and an *after* recording of the corrected behavior, side by side. Today a quickfix cycle leaves no such proof, so a reviewer (or the user reviewing AFK output) cannot see that the bug actually reproduced and was actually fixed without re-running the reproduction by hand.

## CONCRETE USER BENEFIT
After a `quickfix` cycle runs in a repo that configures a walkthrough hook, the user can open the cycle's artifact directory and watch two clearly labeled recordings — the broken behavior captured *before* the fix and the corrected behavior captured *after* — plus their screenshots, without re-running the reproduction themselves. In a repo with no hook configured, the cycle still completes cleanly with no failure and no spurious artifacts.

## USABLE END-STATE
A `quickfix` cycle produces, under `docs/cycle/<NNNN>-quickfix-<slug>/walkthrough/before/` and `.../walkthrough/after/`, the media emitted by the shared hook, each phase recorded in its own manifest (`walkthrough-before-artifacts.json` / `walkthrough-after-artifacts.json`). The *before* capture runs after the fix is planned but before it is applied; the *after* capture runs after `verify`. With no hook configured, both steps skip clean (`step.end { status: "skipped", reason: "walkthrough_hook_absent" }`) and the cycle outcome is unchanged.

## Objective
Wire before/after walkthrough capture into the `quickfix` workflow by reusing the existing phase-aware walkthrough mechanism already implemented for the `feature` workflow's `walkthrough_capture` step. This cycle ensures the `quickfix` workflow definition in `src/defaults/workflows.yml` declares the two phase-scoped steps (`walkthrough_before` between `plan_fix` and `quick_fix`; `walkthrough_after` as the final step after `verify`), that the synced `.cycle/` copy matches, and that the before/after capture, phase-scoped media collection, per-phase manifests, and clean-skip semantics are verified by tests.

## Source Issue
`txt-20260601-162549-add-a-before-and-after-walkthrough-to-th` — "Add before/after walkthrough capture to the quickfix bug-fix workflow"

## Scope

### In Scope
- `quickfix` workflow in `src/defaults/workflows.yml` declares `walkthrough_before` (between `plan_fix` and `quick_fix`) and `walkthrough_after` (final step, after `verify`) as `agent: bash` steps with no `command`, handled by the phase-aware walkthrough intercept; run `npm run sync-defaults` so `.cycle/workflows.yml` matches byte-for-byte.
- Tests covering the quickfix before/after capture path: `CYCLE_WALKTHROUGH_PHASE` is set to `before`/`after`, media is collected from `walkthrough/<phase>/`, per-phase manifests (`walkthrough-<phase>-artifacts.json`) are written, and a `walkthrough_before` hook failure fails the cycle before the fix is applied.
- Tests covering the no-hook clean-skip path for both quickfix walkthrough steps (one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no failure).

### Out of Scope
- Any change to the `feature` workflow's un-phased `walkthrough_capture` path — it must remain byte-for-byte unchanged.
- Introducing a new or parallel hook mechanism, new config keys, or a default walkthrough hook for this repo (cycle's own CLI repo configures no hook and must skip clean).
- Changes to media formats, recording tooling, or the contents the hook itself produces — the hook is repo-supplied and opaque to the engine.

## Requirements
- The `quickfix` workflow steps `walkthrough_before` and `walkthrough_after` route through the existing phase-aware name-keyed intercept in `run-cycle.ts` (gated on `WALKTHROUGH_PHASES`: `walkthrough_before → "before"`, `walkthrough_after → "after"`) and never reach `execBashStep` or the completion-proof machinery.
- When a phase is set, the engine passes `CYCLE_WALKTHROUGH_PHASE` (`before`/`after`) to the hook via the `extra`/`buildChildEnv` re-inject contract alongside `CYCLE_ARTIFACT_DIR`, collects media from `<artifactDir>/walkthrough/<phase>/`, and writes the per-phase manifest `walkthrough-<phase>-artifacts.json`.
- The shared hook is reused: discovery via the `.cycle/walkthrough.sh` convention or an explicit `engine.walkthrough_hook` config path; opt-in / skip-clean semantics identical to the `feature` walkthrough.
- `src/defaults/workflows.yml` and `.cycle/workflows.yml` are kept in sync via `npm run sync-defaults`.
- Coverage must not decrease vs the master baseline (Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%) and all per-file floors hold, including `src/engine/walkthrough.ts` (95%) and `src/engine/run-cycle.ts` (90%).
- **Failure behavior**: A non-zero `walkthrough_before` hook exit routes through the fatal step-failure path (`step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step: "walkthrough_before" }`) so the cycle fails *before* the fix is applied. A non-zero `walkthrough_after` hook exit likewise fails the cycle via the fatal path. A post-success collect/manifest-write failure is best-effort: it emits `step.walkthrough_capture_failed { cycle_id, step, artifact, error }`, omits the manifest pointer, and leaves the cycle outcome unchanged — the error is surfaced as an event, never swallowed silently. With no hook configured, both steps emit exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` (no `step.start`, no failure).

## Acceptance Criteria
- [ ] After a `quickfix` cycle in a repo with a walkthrough hook, the user can open `docs/cycle/<NNNN>-quickfix-<slug>/walkthrough/before/` and `.../walkthrough/after/` and find the hook-emitted media, each referenced by its own `walkthrough-before-artifacts.json` / `walkthrough-after-artifacts.json` manifest.
- [ ] `src/defaults/workflows.yml` `quickfix` steps list contains `walkthrough_before` (immediately after `plan_fix`, before `quick_fix`) and `walkthrough_after` (last step, after `verify`), both `agent: bash` with no `command`.
- [ ] `.cycle/workflows.yml` is byte-for-byte identical to `src/defaults/workflows.yml` after `npm run sync-defaults` (verifiable by `diff -q`).
- [ ] A test asserts that for a `walkthrough_before` step the hook receives `CYCLE_WALKTHROUGH_PHASE=before`, media is collected from `walkthrough/before/`, and the manifest is named `walkthrough-before-artifacts.json` (and the analogous `after` assertions).
- [ ] **Failure-path:** A test asserts that a non-zero `walkthrough_before` hook exit produces `step.end { status: "failed" }` and `cycle.end { status: "failed", failing_step: "walkthrough_before" }`, with the cycle failing before `quick_fix` runs.
- [ ] **Failure-path:** A test asserts that with no hook configured, each quickfix walkthrough step emits exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` and the cycle does not fail.
- [ ] The `feature` workflow's `walkthrough_capture` (un-phased) behavior is unchanged — existing feature-walkthrough tests still pass.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner (the repo's existing convention), driving `runCycle` in-process with an injected log collector.
- Cardinality-pin exactly-once events (`step.end` per step, `cycle.end`) with `filter(predicate).length === 1`, per the repo's exactly-once test rule.
- Key scenarios: happy path (before + after capture with a fake executable hook that writes media into the phase subdir, asserting phase env, media collection dir, and manifest basename); failure path (`walkthrough_before` non-zero exit fails the cycle before the fix); no-hook clean-skip for both steps; best-effort manifest-write-failure path emitting `step.walkthrough_capture_failed` without changing the cycle outcome.
- No UI is touched in this repo, so no Playwright/E2E tests are required for this cycle; the recordings themselves are produced by the repo-supplied hook, which is out of scope.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Confirm the `src/engine/walkthrough.ts` architecture note already describing the `quickfix` `walkthrough_before`/`walkthrough_after` phase-scoped steps matches the shipped `workflows.yml`; update it if the step wiring changes.
- **README.md**: No user-facing README change required — the walkthrough hook is an opt-in, repo-supplied convention already documented under `docs/ENGINE.md` → *Walkthrough capture*; cross-check that the quickfix before/after phases are reflected there and amend if needed.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- The existing phase-aware walkthrough orchestration in `src/engine/walkthrough.ts` (`resolveWalkthroughHook` / `execWalkthroughHook` / `collectWalkthroughMedia` / `writeWalkthroughManifest` / `walkthroughManifestName`) and the `WALKTHROUGH_PHASES`-gated intercept in `src/engine/run-cycle.ts`.
- The `quickfix` workflow already present in `src/defaults/workflows.yml`.
- `npm run sync-defaults` (`scripts/sync-defaults.mjs`) to propagate `src/defaults/` → `.cycle/`.
- No external services or env vars required beyond the optional, repo-supplied `.cycle/walkthrough.sh` hook (or `engine.walkthrough_hook` config path), which is absent in this repo and must skip clean.
