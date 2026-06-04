# Research: Cycle 0259

## Cycle Context
SPEC.md asks to wire before/after walkthrough capture into the `quickfix` workflow by reusing the existing phase-aware walkthrough mechanism built for the `feature` workflow's `walkthrough_capture` step: declare two phase-scoped `agent: bash` steps in the `quickfix` workflow of `src/defaults/workflows.yml` — `walkthrough_before` (between `plan_fix` and `quick_fix`) and `walkthrough_after` (final step, after `verify`) — keep the synced `.cycle/workflows.yml` byte-for-byte identical via `npm run sync-defaults`, and verify the before/after capture, phase-scoped media collection (`walkthrough/<phase>/`), per-phase manifests (`walkthrough-<phase>-artifacts.json`), `CYCLE_WALKTHROUGH_PHASE` plumbing, fatal-on-failure semantics, and no-hook clean-skip via tests. **This work is already fully present on master**, delivered by cycle 0026 (commit `331a675`); this cycle is a duplicate and is signalled as a no-op.

## Current Codebase State

### Relevant Components
- `quickfix` workflow definition: `src/defaults/workflows.yml:53` — the workflow block; steps at lines 56–62.
  - `walkthrough_before` — `src/defaults/workflows.yml:58` (`{ name: walkthrough_before, agent: bash }`, between `plan_fix` at line 57 and `quick_fix` at line 59).
  - `walkthrough_after` — `src/defaults/workflows.yml:62` (`{ name: walkthrough_after, agent: bash }`, final step after `verify` at line 61).
- Deployed copy: `.cycle/workflows.yml` — `diff -q src/defaults/workflows.yml .cycle/workflows.yml` reports no differences (byte-for-byte in sync).
- Phase-aware intercept: `src/engine/run-cycle.ts:494` (`if (WALKTHROUGH_PHASES.has(step.name))`), gated by the declarative map at `src/engine/run-cycle.ts:49`.
- Walkthrough orchestration module: `src/engine/walkthrough.ts` (`resolveWalkthroughHook` / `execWalkthroughHook` / `collectWalkthroughMedia` / `writeWalkthroughManifest` / `walkthroughManifestName`).
- Documentation: `docs/ENGINE.md:263` (walkthrough capture overview) and `docs/ENGINE.md:277` ("Phase-aware quickfix capture (before/after)").

### Existing Patterns to Follow
- **Phase map gate**: `WALKTHROUGH_PHASES` (`src/engine/run-cycle.ts:49`) maps step name → phase label (`walkthrough_capture → undefined`, `walkthrough_before → "before"`, `walkthrough_after → "after"`). Membership is the intercept gate; the mapped value is the phase label.
- **Phase env plumbing**: `CYCLE_WALKTHROUGH_PHASE` is conditionally spread into the hook env only when a phase is set — `src/engine/run-cycle.ts:521` (`...(phase ? { CYCLE_WALKTHROUGH_PHASE: phase } : {})`), re-injected via the `extra`/`buildChildEnv` contract alongside `CYCLE_ARTIFACT_DIR`. The un-phased `walkthrough_capture` env is therefore byte-for-byte unchanged.
- **Phase-scoped media/manifest**: media collected from `<artifactDir>/walkthrough/<phase>/` via `collectWalkthroughMedia(artifactDir, phase)`; manifest written to `walkthrough-<phase>-artifacts.json` via `writeWalkthroughManifest(artifactDir, media, phase)` (basename from `walkthroughManifestName(phase)`).
- Failure handling (existing, unchanged):
  - No hook configured ⇒ step is inert: exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }`, no `step.start`, no failure.
  - Non-zero hook exit / timeout ⇒ fatal step-failure path (`step.end { status: "failed" }` → `cycle.end { status: "failed", failing_step }`); a `walkthrough_before` failure fails the cycle before `quick_fix` runs.
  - Post-success collect/manifest-write failure ⇒ best-effort degrade: emits `step.walkthrough_capture_failed { cycle_id, step, artifact, error }` (`src/engine/run-cycle.ts:546`), omits the manifest pointer, keeps `step.end { status: "ok" }`, cycle outcome unchanged.
- Observability: structured events to `.cycle/log.jsonl` — `step.end` (with `walkthrough_artifacts` pointer on success), `step.walkthrough_capture_failed` on degrade. Same JSONL event conventions as the rest of the engine.
- Idempotency / retry-safety: the intercept `continue`s before the generic exec dispatch, so these steps never reach `execBashStep`, the completion-proof machinery, or the shared `step.end`/terminal-routing tail. Per-phase subdirectories and per-phase manifest names keep before/after artifacts isolated.

### Dependencies & Integration Points
- `src/engine/walkthrough.ts` — shared discovery/exec/collection/manifest logic (`docs/ENGINE.md` → *Walkthrough capture*).
- `scripts/sync-defaults.mjs` (`npm run sync-defaults`) — propagates `src/defaults/` → `.cycle/`; already run (copies are in sync).
- Hook discovery: `.cycle/walkthrough.sh` convention or `engine.walkthrough_hook` config path. This repo configures no hook, so both quickfix walkthrough steps skip clean.

### Test Infrastructure
- Test framework: Node's built-in `node:test` runner with `node:assert/strict`.
- Test conventions: in-process `runCycle` driven with an injected log collector; exactly-once events cardinality-pinned with `filter(predicate).length === 1`.
- Current coverage of the change area (already present):
  - `tests/defaults/quickfix-yaml.test.ts:12` — asserts the quickfix step sequence `["plan_fix", "walkthrough_before", "quick_fix", "test_fix", "verify", "walkthrough_after"]` and a 6-step count for `src/defaults/workflows.yml`; lines 15–18 assert both walkthrough steps are `agent: bash` with no `command`. Lines 22–34 repeat the identical assertions against the deployed `.cycle/workflows.yml`, proving sync-defaults parity.
  - `tests/engine/run-cycle.walkthrough.test.ts:377` — quickfix before/after happy path: hook branches on `$CYCLE_WALKTHROUGH_PHASE` (assertion at line 393), media collected from `walkthrough/<phase>/`, per-phase manifests and pointers verified.
  - `tests/engine/run-cycle.walkthrough.test.ts:427` — no-hook clean-skip for both `walkthrough_before` and `walkthrough_after` (exactly one `step.end { status: "skipped", reason: "walkthrough_hook_absent" }` each).
  - `tests/engine/run-cycle.walkthrough.test.ts:442` — `walkthrough_before` non-zero exit is fatal; `r.failingStep === "walkthrough_before"`, `cycle.end.failing_step === "walkthrough_before"`, and `quick_fix` does not run.
  - `tests/engine/run-cycle.walkthrough.test.ts:478` — `walkthrough_after` degrades via `step.walkthrough_capture_failed` when the per-phase manifest write fails, without changing the cycle outcome.
- Failure-path test coverage: present — fatal-before-fix, no-hook clean-skip, and best-effort manifest-write-failure paths are all covered (cited above).

## Code References
- `src/defaults/workflows.yml:53` — `quickfix` workflow block.
- `src/defaults/workflows.yml:58` — `walkthrough_before` step (between `plan_fix` and `quick_fix`).
- `src/defaults/workflows.yml:62` — `walkthrough_after` step (final, after `verify`).
- `src/engine/run-cycle.ts:49` — `WALKTHROUGH_PHASES` declarative map.
- `src/engine/run-cycle.ts:494` — `if (WALKTHROUGH_PHASES.has(step.name))` intercept.
- `src/engine/run-cycle.ts:521` — conditional `CYCLE_WALKTHROUGH_PHASE` env injection.
- `src/engine/run-cycle.ts:546` — `step.walkthrough_capture_failed` degrade emit.
- `tests/defaults/quickfix-yaml.test.ts:12` / `:28` — source + deployed step-sequence assertions.
- `tests/engine/run-cycle.walkthrough.test.ts:377` / `:427` / `:442` / `:478` — happy-path, clean-skip, fatal, and degrade tests.
- `docs/ENGINE.md:277` — "Phase-aware quickfix capture (before/after)".

## Open Questions
None. The SPEC's In-Scope items, Requirements, and all Acceptance Criteria are already implemented, synced, tested, and documented on master (cycle 0026, commit `331a675`). This cycle is a duplicate; `NOOP.md` has been written with `reason: duplicate` and file:line evidence so the engine can resolve the cycle before plan/build/review run.
