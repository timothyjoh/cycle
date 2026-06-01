# SPEC — Cycle 0026: Before/After Walkthrough Capture for the `quickfix` Workflow

## Objective
The `quickfix` workflow delivers a surgical bug fix but produces no visual record of what was actually broken or what the fix corrected. This cycle adds two walkthrough-capture steps to `quickfix` — one that records the broken behavior *before* the fix is applied and one that records the corrected behavior *after* — storing both as clearly labeled cycle artifacts. It reuses the existing repo-agnostic walkthrough-hook mechanism (discovery, spawn, bounded-kill timeout, degrade paths) rather than introducing a parallel mechanism, so a reviewer can see the regression and its resolution side by side as first-class artifacts under the cycle directory.

## Source Issue
`txt-20260601-162549-add-a-before-and-after-walkthrough-to-th` — "Add before/after walkthrough capture to the quickfix bug-fix workflow"

## Scope

### In Scope
- Add two `agent: bash` steps to the `quickfix` workflow in `src/defaults/workflows.yml` — `walkthrough_before` (after `plan_fix`, before `quick_fix`) and `walkthrough_after` (final step, after `verify`) — and run `npm run sync-defaults` to copy `src/defaults/` → `.cycle/`.
- Make the `run-cycle.ts` walkthrough intercept phase-aware: a small declarative map of walkthrough step name → phase label (`walkthrough_capture` → none, `walkthrough_before` → `before`, `walkthrough_after` → `after`) that reuses the existing `resolveWalkthroughHook` / `execWalkthroughHook` discovery, spawn, `engine.walkthrough_hook_timeout_ms` bounded-kill, and degrade machinery unchanged, while passing `CYCLE_WALKTHROUGH_PHASE` to the hook and collecting media from the phase-scoped subdirectory into a phase-labeled manifest.
- Phase-scoped media collection/manifest: when a phase is set, the engine collects from `<artifactDir>/walkthrough/<phase>/` and writes `<artifactDir>/walkthrough-<phase>-artifacts.json`, surfaced via the existing `walkthrough_artifacts` pointer on `step.end`; the existing un-phased `walkthrough_capture` behavior (collect from `walkthrough/`, write `walkthrough-artifacts.json`) is preserved byte-for-byte.

### Out of Scope
- Any change to the `feature` workflow's existing single `walkthrough_capture` step or its artifact paths.
- Adding walkthrough capture to `document` or `e2e-tests` workflows.
- Authoring an actual `.cycle/walkthrough.sh` hook for cycle's own repo (it intentionally configures none, so the steps skip clean here).
- Changes to the timeout config surface, kill-grace constant, or hook-discovery rules — these are reused as-is.

## Requirements
- The `quickfix` workflow must run `walkthrough_before` before the fix is applied and `walkthrough_after` after `verify`, each reusing the shared walkthrough hook.
- Each phase step must pass `CYCLE_WALKTHROUGH_PHASE` (`before` / `after`) to the hook (via the `extra` env per the `buildChildEnv` strip/re-inject contract, alongside the existing `CYCLE_ARTIFACT_DIR` re-injection), so a single hook script can branch on phase.
- `before` and `after` media must be stored under distinct, clearly labeled locations (`<artifactDir>/walkthrough/before/` and `<artifactDir>/walkthrough/after/`) with distinct manifests (`walkthrough-before-artifacts.json` / `walkthrough-after-artifacts.json`).
- The shared mechanism must be reused, not duplicated: hook discovery, spawn, bounded-kill timeout, and best-effort collect/manifest degrade logic come from `src/engine/walkthrough.ts` and the existing intercept code path.
- Coverage floors must be met: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%; per-file `src/engine/walkthrough.ts` ≥ 95% and `src/engine/run-cycle.ts` ≥ 90%.
- **Failure behavior**:
  - *No hook configured* (the cycle-repo default): each phase step is inert — one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no artifact, no cycle failure (identical semantics to the feature `walkthrough_capture`).
  - *Non-zero hook exit or timeout*: routes through the existing fatal step-failure path — `step.end { status: "failed", exit_code, stderr }` (timeout wording via `formatWalkthroughTimeoutError`) → `cycle.end { status: "failed", failing_step }` → early return, with the `finally` cleanup still running. A `walkthrough_before` failure fails the cycle before the fix is applied, consistent with the existing fatal contract.
  - *Post-success collect/manifest-write failure* (e.g. phase subdir unreadable, manifest path is a directory): best-effort degrade — emit `step.walkthrough_capture_failed { cycle_id, step, artifact, error }`, omit the pointer, keep `step.end { status: "ok" }`, never mask the cycle outcome. Errors are surfaced via this named event, never swallowed silently.
  - *Hook produces no media in a phase*: `step.end { status: "ok" }` with no pointer and no manifest for that phase.

## Acceptance Criteria
- [ ] `src/defaults/workflows.yml` `quickfix` workflow contains `walkthrough_before` (between `plan_fix` and `quick_fix`) and `walkthrough_after` (final step after `verify`), both `agent: bash` with no `command`, and `.cycle/workflows.yml` matches after `npm run sync-defaults` (no diff).
- [ ] With a configured hook that writes media keyed on `CYCLE_WALKTHROUGH_PHASE`, a `quickfix` run produces `<artifactDir>/walkthrough/before/…` and `<artifactDir>/walkthrough/after/…` media plus `walkthrough-before-artifacts.json` and `walkthrough-after-artifacts.json`, each referenced by a `walkthrough_artifacts` pointer on the respective step's `step.end`.
- [ ] With no hook configured, a `quickfix` run emits exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` for each of `walkthrough_before` and `walkthrough_after`, with zero `step.start` and zero `failed` step.end for those steps.
- [ ] Failure-path: a hook that exits non-zero on the `before` phase produces `step.end { status: "failed" }` for `walkthrough_before` followed by `cycle.end { status: "failed", failing_step: "walkthrough_before" }`, and `quick_fix` does not run.
- [ ] Failure-path: a post-success collect/manifest failure on a phase step emits exactly one `step.walkthrough_capture_failed` event for that step, the step still ends `ok`, and no `walkthrough_artifacts` pointer is attached.
- [ ] The existing `feature` `walkthrough_capture` behavior and artifact paths are unchanged (existing `tests/engine/run-cycle.walkthrough.test.ts` scenarios still pass without modification).
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- `node:test` with `node --experimental-strip-types`, following the patterns in `tests/engine/run-cycle.walkthrough.test.ts` and `tests/engine/walkthrough.test.ts`.
- Integration tests driving `runCycle` over a `quickfix` workflow with a temp git repo and an executable `.cycle/walkthrough.sh` that branches on `CYCLE_WALKTHROUGH_PHASE`:
  - Happy path: both phases produce labeled media + per-phase manifests + pointers.
  - Skip-clean: no hook ⇒ both phase steps inert (cardinality-pinned `filter(...).length === 1` per the exactly-once event rule).
  - Failure: non-zero hook exit on `before` ⇒ fatal cycle.end with correct `failing_step`, and `quick_fix` is not reached.
  - Degrade: forced collect/manifest failure ⇒ single `step.walkthrough_capture_failed`, step still `ok`, no pointer.
  - Phase-env: assert the hook receives `CYCLE_WALKTHROUGH_PHASE` set to `before` / `after`.
- Unit tests for any phase-aware helper added to `src/engine/walkthrough.ts` (phase-scoped collection / manifest naming), including missing-subdir ⇒ `[]`.
- Regression: existing feature `walkthrough_capture` tests run unchanged to prove backward compatibility.
- No UI in this change; no Playwright/E2E required.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: update the `src/engine/walkthrough.ts` and `src/engine/run-cycle.ts` architecture notes to describe the phase-aware intercept and the `walkthrough_before` / `walkthrough_after` quickfix steps; add the `CYCLE_WALKTHROUGH_PHASE` env contract and the per-phase manifest naming.
- **docs/ENGINE.md**: extend the *Walkthrough capture* section to cover the `quickfix` before/after phases — phase-scoped media subdirectories, per-phase manifests, the `CYCLE_WALKTHROUGH_PHASE` hook contract, and that the feature `walkthrough_capture` path is unchanged.
- **README.md**: no user-facing CLI surface change; note in the relevant docs that an opt-in `.cycle/walkthrough.sh` hook can now branch on phase for quickfix before/after capture.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- The existing `src/engine/walkthrough.ts` mechanism (`resolveWalkthroughHook`, `execWalkthroughHook`, `collectWalkthroughMedia`, `writeWalkthroughManifest`) and the `run-cycle.ts` name-keyed intercept.
- The existing `quickfix` workflow definition in `src/defaults/workflows.yml` and the `npm run sync-defaults` script.
- `engine.walkthrough_hook` / `.cycle/walkthrough.sh` convention and the `engine.walkthrough_hook_timeout_ms` config (both reused; no new config introduced).
- No new external services or env vars beyond the engine-provided `CYCLE_WALKTHROUGH_PHASE` passed to the hook.
