# SPEC — Cycle 0024: End-of-Feature Walkthrough Capture Step

## Objective
Deliver an end-of-cycle walkthrough-capture step for the `feature` workflow that runs an optional, project-provided walkthrough hook, collects any screenshots/video the hook emits as first-class cycle artifacts under the cycle artifact dir, and references the produced media from the cycle completion record. The step must be repo-agnostic: when a repo configures no walkthrough hook (as cycle's own CLI repo does not), the step skips cleanly as a silent success, so the `feature` workflow continues to pass green here with the step present but inert. This turns a delivered feature into something a human can review visually without changing the contract for repos that have nothing to capture.

## Source Issue
`txt-20260601-162549-add-an-end-of-feature-workflow-walkthrou` — "Add end-of-feature walkthrough-capture step (screenshots + video) as cycle artifacts"

## Scope

### In Scope
- Add a `walkthrough_capture` step to the END of the `feature` workflow in `src/defaults/workflows.yml` (after the documentation step), with a `skip_unless`-style guard keyed on a configured walkthrough hook, and run `npm run sync-defaults` to propagate into `.cycle/`.
- Engine orchestration in `src/engine/run-cycle.ts`: detect the optional project hook (`.cycle/walkthrough.sh` convention, or an `engine.walkthrough_hook` config command), invoke it when present, collect the media it emits into the cycle artifact dir, and surface a `walkthrough_artifacts`-style pointer on the cycle completion record (mirroring the failed-bash `stdout_artifact` pattern); when absent, skip clean with no artifact and no failure.
- Tests covering the three paths: skip-clean (no hook — the cycle-on-cycle case), configured-hook producing media artifacts + completion-record reference, and best-effort write-failure degrade.

### Out of Scope
- Any built-in web-driving / Playwright / headless-shell capture implementation. The engine only orchestrates a project-provided hook and collects its output; app-specific boot/drive logic lives entirely in the hook, which this cycle does not author.
- Adding the step to any workflow other than `feature`.
- Configuring a walkthrough hook for cycle's own repo (it remains a CLI with no hook; the step must always skip here).
- Any change to the existing `SPEC`/`PLAN`/`BUILD`/documentation step semantics or to non-`feature` completion records.

## Requirements
- The new step runs only after the documentation step at the end of the `feature` workflow; it never reorders or alters preceding steps.
- Hook discovery is repo-agnostic and explicit: a step is "active" only when a walkthrough hook is configured/present (`.cycle/walkthrough.sh` present and executable, or an `engine.walkthrough_hook` command configured). With no hook, the step is inert.
- When active, the hook is invoked via `spawn`/`spawnSync` with array args (never `exec`/`shell: true`), inheriting the curated child env from `src/engine/child-env.ts` with any required `CYCLE_*` vars (e.g. `CYCLE_BASE`, `CYCLE_ID`, the artifact dir) re-injected through `extra`.
- Media emitted by the hook into the cycle artifact dir is recorded on the cycle completion record via a pointer field (e.g. `walkthrough_artifacts`), consistent with the existing `stdout_artifact` surfacing pattern.
- The artifact/pointer write is best-effort and follows the existing capture pattern.
- **Failure behavior**: When no hook is configured, the step skips cleanly — a normal silent success path with no artifact and no failure (consistent with existing conditional/skip step semantics); it MUST NOT fail the cycle. When the hook itself exits non-zero, the step surfaces the failure through the normal step-failure routing (non-zero exit, captured stderr) rather than swallowing it. When the hook succeeds but the engine cannot write/collect the media or its pointer, the engine degrades: it emits a diagnostic event (e.g. `step.walkthrough_capture_failed { cycle_id, step, artifact, error }`), omits the pointer, and never masks the cycle outcome or terminal-failure routing — it MUST NOT crash. Errors are surfaced (emitted event or non-zero exit), never silently dropped.

## Acceptance Criteria
- [ ] `src/defaults/workflows.yml` contains a `walkthrough_capture` step as the last step of the `feature` workflow, and `.cycle/workflows.yml` is byte-identical after `npm run sync-defaults`.
- [ ] On cycle's own repo (no walkthrough hook configured), running the `feature` workflow reaches the `walkthrough_capture` step and it skips clean: no artifact is written, no failure is recorded, and the cycle completes green.
- [ ] When a walkthrough hook is configured and emits media into the cycle artifact dir, the produced files are present under `docs/cycle/<cycle_id>-feature-<slug>/` and the cycle completion record carries a pointer referencing them.
- [ ] **Failure-path:** when the hook succeeds but the artifact/pointer write fails, the engine emits a `step.walkthrough_capture_failed`-style diagnostic event, omits the pointer, leaves the original cycle outcome unchanged, and does not crash.
- [ ] **Failure-path:** when no hook is configured, the step produces no `step.end { status: "failed" }` and the cycle outcome is unaffected by the step's presence.
- [ ] All existing tests still pass (`npm test` green).
- [ ] No compiler/linter warnings introduced (`npm run typecheck` clean).

## Testing Strategy
- Node's built-in `node:test` runner with the repo's existing engine-test harness conventions (see `tests/engine/`).
- Key scenarios:
  - **Skip-clean (happy path for this repo):** no hook present → step is inert; assert no artifact, no `step.end { status: "failed" }`, cycle outcome unchanged. Use cardinality-pinned assertions (`filter(...).length === 1`) for any exactly-once events per the test conventions.
  - **Configured-hook produces media:** stub a hook that writes media files into the artifact dir → assert files present and a completion-record pointer references them.
  - **Write-failure degrade:** force the artifact/pointer write to fail (real filesystem manipulation — `chmod`/temp dir — since `node:fs/promises` cannot be stubbed via `mock.method`; use `node:fs` interception where mocking is needed) → assert a single `step.walkthrough_capture_failed`-style diagnostic event, no pointer, and unchanged cycle outcome.
  - **Hook non-zero exit:** assert failure routes through the normal step-failure path rather than being swallowed.
- Subprocess invocations in tests use array-arg `spawn` only; no `shell: true`.
- No E2E/Playwright tests required — this cycle adds orchestration only and introduces no UI of its own.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: Document the new `walkthrough_capture` step in the `feature` workflow, the optional walkthrough-hook convention (`.cycle/walkthrough.sh` / `engine.walkthrough_hook`), the skip-clean-when-absent contract, and the `walkthrough_artifacts` completion-record pointer + `step.walkthrough_capture_failed` diagnostic event, mirroring the existing failed-bash `stdout_artifact` notes in the run-cycle architecture section.
- **README.md**: Surface that delivered features can emit optional screenshot/video walkthrough artifacts via a project-provided hook, and that repos without a hook are unaffected.
- **docs/ENGINE.md**: Add a *Walkthrough capture* subsection describing hook discovery, orchestration, artifact collection, the skip path, and the best-effort write degrade behavior.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing engine artifact-capture machinery in `src/engine/run-cycle.ts` (the failed-bash `.out` / `stdout_artifact` pattern) and the cycle artifact-dir computation.
- `src/engine/child-env.ts` `buildChildEnv` for subprocess env construction and `CYCLE_*` re-injection.
- The conditional/skip step semantics already used by other guarded steps (`skip_unless`-style).
- `npm run sync-defaults` to propagate `src/defaults/workflows.yml` → `.cycle/`.
- No external services or new env vars required; the walkthrough hook is repo-provided and optional.
