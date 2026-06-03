I have everything needed to document the codebase state.

```markdown
# Research: Cycle 0041

## Cycle Context
SPEC.md (`docs/cycle/0041-feature-add-a-regression-test-for-the-e2e-tests/SPEC.md`) asks for a single, test-only regression test added to `tests/engine/noop-resolution.test.ts` that drives the **`e2e-tests`** workflow (a non-`feature` workflow) through a `research` step which exits 0 and writes a valid `NOOP.md`, asserting the cycle short-circuits to `cycle.noop { detected_at_step: "research" }` → `cycle.end { status: "noop" }` with `runCycle` returning `{ status: "noop", reason, detectedAtStep: "research" }`, and that the downstream `test_plan`/`test_build`/`review` steps never start. No engine source changes are in scope — the behavior under test already ships; the gap is purely missing cross-workflow test coverage of the name-keyed `step.name === "research"` gate (cycle 0035 REVIEW.md Finding 5, the sole MUST-FIX). The test must cardinality-pin `cycle.noop` with `filter(...).length === 1` per the test-conventions rule, assert ordering, and not establish any empty-diff precondition.

## Current Codebase State

### Relevant Components
- Research-phase no-op short-circuit (the EARLY detection point): name-keyed on `step.name === "research"` with **no workflow check**; reads `NOOP.md` via `classifyNoopMarker`, and on a valid marker sets `noopOutcome = { reason, step: step.name }` while leaving `r.status === "ok"` — `docs/cycle/.../` source at `src/engine/run-cycle.ts:773-795`.
- Shared no-op consumer: after `step.end` fires for the detecting step, `if (noopOutcome)` emits `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` then `cycle.end { status: "noop" }` and returns `{ cycleId, artifactDir, status: "noop", reason, detectedAtStep }` from inside the `try` (so the `finally` checkout/base-pull cleanup runs) — `src/engine/run-cycle.ts:852-870`.
- Marker classifier: `classifyNoopMarker(path)` (fail-closed; recognized `reason:` category ∈ `already-satisfied | duplicate | not-actionable` + ≥1 `file.ext:line` evidence line) and the `NoopClassification` type — imported at `src/engine/run-cycle.ts:30`; defined in `src/engine/noop-marker.ts`.
- Workflow selection: `runCycle` resolves the workflow by name via `cfg.workflows.find((w) => w.name === opts.workflow)` and throws `unknown workflow: <name>` if absent — `src/engine/run-cycle.ts:341-342`. Workflow names are **not** restricted to an enum; any name defined in `workflows.yml` is accepted.
- `runCycle` entry/options: `RunCycleOpts` carries `workflow: string` at `src/engine/run-cycle.ts:324`; `cycle.start` is emitted with `workflow`, `title`, `issue_id` at `src/engine/run-cycle.ts:359`.
- Real `e2e-tests` workflow shape (for fidelity of the fake): steps are `research`, `test_plan`, `test_build`, `review`, `fix` (`skip_unless: MUST-FIX.md`), `verify` (`agent: bash`) — `src/defaults/workflows.yml:64-73`.

### Existing Patterns to Follow
- Test scaffolding lives entirely in `tests/engine/noop-resolution.test.ts`. Two repo builders exist:
  - Single-step `feature` repo: `workflowYml(stepName)` + `setupRepo(fakeBody, stepName)` — `tests/engine/noop-resolution.test.ts:15-51`. Hardcodes `- name: feature` (`:24`).
  - Multi-step `feature` repo: `multiWorkflowYml(steps: string[])` + `setupMultiRepo(fakeBody, steps)` — `tests/engine/noop-resolution.test.ts:82-123`. **Hardcodes the workflow name `feature` at `:100`** (`"  - name: feature"`); only the step list is parameterized. This is the helper the SPEC says to generalize (or add a sibling builder) to emit an `e2e-tests` workflow without regressing existing callers.
- Fake-agent pattern: a `#!/bin/bash` script (`SHEBANG`, `:58`) placed at `<bin>/claude`, made executable via `chmod 0o755`, and put on PATH through `env: { PATH: bin + ":" + (process.env.PATH || ""), CYCLE_BASE: "main" }` passed to `runCycle` — e.g. `tests/engine/noop-resolution.test.ts:144-149`. The fake locates the per-cycle artifact dir with `dir=$(ls -d docs/cycle/${CYCLE_ID}-* 2>/dev/null | head -1)`.
- Existing research-phase fake: `researchNoopFake(reason)` writes a valid `NOOP.md` (`reason: <reason>` + `## Evidence` + a `src/engine/run-cycle.ts:678` line) and prints a non-empty `## Doc` body so the completion-proof passes for every artifact step — `tests/engine/noop-resolution.test.ts:128-136`.
- Canonical happy-path research test (the closest template for the new `e2e-tests` case): `tests/engine/noop-resolution.test.ts:138-190`. It uses `setupMultiRepo(researchNoopFake("already-satisfied"), ["research","plan","build","review"])`, asserts `r.status === "noop"`, `r.reason`, `r.detectedAtStep === "research"`, cardinality-pins `cycle.noop` (`:155-156`), asserts `noop[0].detected_at_step === "research"` (`:159`), asserts `cycle.end {status:"noop"}` ordering after `cycle.noop` (`:162-165`), asserts research `step.end` ok exactly once (`:168-172`), and that **no `step.start` fires** for each downstream step (`:174-180`).
- Reason-propagation loop pattern (each category): `tests/engine/noop-resolution.test.ts:192-214`.
- Event parsing: `parseEvents(log)` splits `.cycle/log.jsonl` lines and `JSON.parse`s each — `tests/engine/noop-resolution.test.ts:73-77`. The log file is read from `join(root, ".cycle/log.jsonl")`.
- Cardinality-pin convention (CLAUDE.md Test conventions): assert exactly-once engine events with `filter(predicate).length === 1`, never `find(...) !== undefined`. `cycle.noop` is an exactly-once event. The existing tests already follow this at `:156`.
- Step-start absence assertion: `events.filter(e => e.event === "step.start" && e.step === downstream).length === 0` (`tests/engine/noop-resolution.test.ts:174-180`) — the SPEC requires this for `test_plan`/`test_build`/`review`.
- Failure handling (of the code under test): the research short-circuit has **no failure branch** — `classifyNoopMarker` is wrapped in `try/catch` that degrades to `{ valid: false }` (`src/engine/run-cycle.ts:785-789`), and an invalid/absent marker simply continues to the next step with no new event. The existing `expectResearchContinues(fakeBody, issueId)` helper (`tests/engine/noop-resolution.test.ts:218-238`) exercises that continuation path on the `feature` workflow; the new test is the positive (short-circuit) counterpart for `e2e-tests`.
- Observability conventions: all engine events are JSONL lines in `.cycle/log.jsonl` (`cycle.start`, `step.start`, `step.end`, `step.completion_check`, `cycle.noop`, `cycle.end`, `cycle.checkout`, `cycle.base_pull`). The new test reads only this file; no metrics/other sinks.
- Completion-proof interaction: `research` is a `"nonempty"` artifact step (`STEP_ARTIFACTS`, `src/engine/run-cycle.ts:69`), so the fake must print a non-empty `RESEARCH.md` body (the `researchNoopFake` `## Doc` printf satisfies this). `NOOP.md` is deliberately **not** in `STEP_ARTIFACTS`. A passing test should observe zero `step.completion_check { status: "fail" }` events (existing assertion at `:182`).

### Dependencies & Integration Points
- `runCycle` — `src/engine/run-cycle.ts` (imported at `tests/engine/noop-resolution.test.ts:7`).
- `loadConfig` / workflow resolution — `src/engine/workflow.ts` (workflow entries validated at `:109-110`; step agent validity at `:153-158`; no workflow-name allowlist). `runCycle` calls into it via `loadConfig` (`src/engine/run-cycle.ts:2`).
- `classifyNoopMarker` / `noop-marker.ts` — `src/engine/noop-marker.ts` (no test change needed).
- Toolchain: `node:test` + `node:assert/strict`, real temp git repos via `spawnSync("git", …)` (`tests/engine/noop-resolution.test.ts:9-13`), fake `claude` on a temp PATH. No external services. `CYCLE_BASE: "main"` is passed in every `runCycle` env; `commit.mode: trunk`, `push: false` in the generated workflows.yml.

### Test Infrastructure
- Test framework: `node:test` with `node:assert` (strict), run via `npm test` (auto-builds via `pretest`); coverage via `npm run test:coverage` → `npm run check:coverage`.
- Test conventions: temp dirs via `mkdtemp` under `tmpdir()`; per-test `try/finally` calling `cleanup(root, bin)` (`tests/engine/noop-resolution.test.ts:53-56`); prompt files written for every step name in `setupMultiRepo` (`:116-118`); fake agent body is a bash script string.
- Current coverage of the change area: the research-phase short-circuit is already exercised — happy path (`:138-190`), per-category propagation (`:192-214`), and six continuation/anti-slop cases (absent/malformed-no-reason/bad-reason/zero-evidence/whitespace/unreadable, `:240-300`) — but **all drive the `feature` workflow only**. There is no `e2e-tests` (non-`feature`) coverage. The build-phase (LATE) fallback and `fix`-step no-op are covered at `:302-464`.
- Failure-path test coverage: extensive for the marker classifier's fail-closed behavior (the `expectResearchContinues` cases and the build-phase malformed/absent cases). The new test's "failure surface" is the assertion itself (a re-introduced `feature`-only gate would let `test_plan`/`test_build`/`review` run and `cycle.noop` not fire).
- Per-file coverage floor: `src/engine/run-cycle.ts` ≥ 90% (CLAUDE.md Coverage policy / FLOORS). Overall floors: Line ≥ 95%, Branch ≥ 75%, Function ≥ 90%. Must not decrease vs master baseline.

## Code References
- `src/engine/run-cycle.ts:773-795` — research-phase no-op detection; name-keyed `step.name === "research"`, no workflow check, fail-closed marker read.
- `src/engine/run-cycle.ts:852-870` — shared no-op consumer: emits `cycle.noop` then `cycle.end {status:"noop"}` and returns the `noop` result after `step.end`.
- `src/engine/run-cycle.ts:341-342` — workflow lookup by name (`unknown workflow` throw); no name allowlist.
- `src/engine/run-cycle.ts:67-81` — `STEP_ARTIFACTS` / `ARTIFACT_STEPS`; `research` is `"nonempty"`, `NOOP.md` absent.
- `src/engine/workflow.ts:109-158` — `loadConfig` workflow/step validation (name+steps required; agent must be known; no workflow-name enum).
- `tests/engine/noop-resolution.test.ts:82-123` — `multiWorkflowYml` / `setupMultiRepo`; hardcodes `name: feature` at `:100`.
- `tests/engine/noop-resolution.test.ts:128-136` — `researchNoopFake(reason)`.
- `tests/engine/noop-resolution.test.ts:138-190` — canonical research-phase happy-path test (template for the new `e2e-tests` case).
- `tests/engine/noop-resolution.test.ts:9-13`, `:53-77` — `git` helper, `cleanup`, `SHEBANG`, `parseEvents`.
- `src/defaults/workflows.yml:64-73` — real `e2e-tests` workflow step names (`research`, `test_plan`, `test_build`, `review`, `fix`, `verify`).
- `docs/ENGINE.md:190` — prose statement of the cross-workflow research-phase short-circuit (the claim this test backs).

## Open Questions
- Whether to generalize `multiWorkflowYml`/`setupMultiRepo` to accept a workflow-name parameter (defaulting to `feature` to preserve every existing caller) or to add a sibling builder for `e2e-tests` — the SPEC permits either (`tests/engine/noop-resolution.test.ts:82-123`). The plan step should choose the approach that leaves the existing `feature` callers byte-for-byte unchanged.
- Which downstream step set to include for the `e2e-tests` workflow in the test fixture (the SPEC requires `research` + at least `test_plan`/`test_build`/`review`); whether to also include `fix`/`verify` to mirror `src/defaults/workflows.yml:72-73` exactly, or to keep the fixture minimal (downstream steps never execute on the short-circuit, so prompt files only need to exist for whatever steps are declared).
```
