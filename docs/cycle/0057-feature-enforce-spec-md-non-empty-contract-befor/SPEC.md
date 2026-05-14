# SPEC — Cycle 0057: Enforce SPEC.md Non-Empty Contract at Spec Step Boundary

## Objective
Stop empty/near-empty `SPEC.md` files from silently passing the `spec` step and corrupting the downstream `plan` → `build` → `review` chain. Today the engine writes whatever the spec agent emits to `<artifactDir>/SPEC.md` and emits `step.end status:ok` regardless of byte count — cycle 0023 produced a 1-byte SPEC.md and `review` had to reconstruct the Spec Compliance Checklist from PLAN.md, collapsing the spec/plan separation the workflow depends on. Adding a post-write byte-floor guard in `runCycle` turns this failure mode into a loud, retriable step failure with a clear error message naming file, byte count, and threshold.

## Source Issue
`refl-0023-spec-md-allowed-to-be-empty-in-cycle-wor-enforce-spec-non-empty` — "Enforce SPEC.md non-empty contract before plan/build/review"

## Scope

### In Scope
- Engine-side post-condition check in `src/engine/run-cycle.ts`: after a successful `spec` step writes `<artifactDir>/SPEC.md`, stat the file and fail the step if its UTF-8 byte length is below a fixed threshold (target: **200 bytes**, finalized in plan). On failure, mutate the step result to `status: "failed"` with a `stderr` of shape `spec post-condition failed: <abs-path> is N bytes (< THRESHOLD)`, emit `step.end status:failed`, and fall through the existing terminal-failure path (`cycle.end status:failed failing_step:"spec"`) so the cycle is retried by the outer drain loop within `max_cycle_attempts`.
- One regression test under `tests/engine/` that drives `runCycle` (or a focused unit equivalent) with a stubbed spec agent emitting an empty / under-threshold artifact and asserts: (a) `step.end` for `spec` is `status:"failed"`, (b) downstream steps (`research`, `plan`, etc.) are NOT executed, (c) `cycle.end status:"failed" failing_step:"spec"` is emitted, (d) the stderr/error string names the path, byte count, and threshold.

### Out of Scope
- Generalized `post:` / `assert:` schema in `workflows.yml` for arbitrary step artifacts (issue option 1). Defer until a second post-condition need surfaces — single-call site does not justify a new schema dimension.
- Threshold tuning beyond the initial 200-byte floor. Plan picks the exact number; future calibration is its own reflection issue if 200 turns out wrong.
- Guarding other artifact files (`PLAN.md`, `BUILD.md`, `REVIEW.md`, `FIX.md`). Only `SPEC.md` is the contract-bearing artifact this cycle hardens.
- Backfilling cycle 0023's empty SPEC.md — archaeology, not workflow hardening (per issue Out of Scope).
- Prompt-side hardening of `prompts/spec.md` (issue option 3). The engine guard is the load-bearing fix; prompt tweaks rely on agent compliance, which is the failure mode being fixed. If touched at all, only a one-line note pointing at the byte floor — and only if it fits inside the existing prompt without restructuring.

## Requirements
- Guard runs unconditionally for any step named `spec` in any workflow, regardless of `no_branch` (dogfood `feature` is `no_branch:true`; consumer default is branch-based — both must enforce). Trigger key is `step.name === "spec"`, not workflow name.
- Threshold is a single named constant in `run-cycle.ts` (e.g. `SPEC_MIN_BYTES = 200`), not scattered. Plan finalizes the value.
- Byte count uses UTF-8 byte length of the post-sanitization payload actually written to disk (i.e., measure after `sanitizeArtifactStdout`, not raw stdout) — sanitization can strip narration/fences and a SPEC that is "200 bytes of `Now I will write the spec…`" must still fail.
- Failure path reuses the existing `r.status === "failed"` branch in `runCycle`; do NOT introduce a parallel exit path. The mutation point is between the artifact `writeFile` and the `step.end` emit.
- `step.end` event for the failing case carries `status: "failed"` and a non-zero `exit_code` (reuse the agent's `r.exitCode` if non-zero, else `1`). No new event types.
- No special-case for the `reflection` / `documentation` non-fatal branches — the `spec` failure falls through to the standard `cycle.end status:failed` path.
- Stderr / error message is greppable: format `spec post-condition failed: <path> is <N> bytes (< <THRESHOLD>)`. Path is absolute (`join(artifactDir, "SPEC.md")` resolved).

## Acceptance Criteria
- [ ] A stubbed `spec` step that writes a < THRESHOLD-byte payload causes `runCycle` to emit `step.end {step:"spec", status:"failed"}` and `cycle.end {status:"failed", failing_step:"spec"}`, and no subsequent step (`research` onward) emits `step.start`.
- [ ] The same stubbed scenario at exactly THRESHOLD bytes passes the guard (boundary is `< THRESHOLD`, not `<=`).
- [ ] A normal happy-path spec step (current passing tests) continues to succeed with no behavioral change — no extra events, same artifact contents.
- [ ] The guard's error string contains the absolute artifact path, the actual byte count, and the threshold value (asserted by regression test).
- [ ] Guard fires for both branch-based and `no_branch:true` workflows (covered by parameterized test or two cases).
- [ ] `src/engine/run-cycle.ts` carries one named constant (e.g. `SPEC_MIN_BYTES`) — no magic numbers at the call site.
- [ ] All existing tests still pass (`npm test`).
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage` passes the coverage gate; new lines in `run-cycle.ts` are covered (the gate enforces `src/engine/triage.ts ≥ 95%`, but the new code lives in `run-cycle.ts` — add coverage anyway to keep the aggregate ≥ baseline).
- [ ] No compiler / linter warnings introduced.

## Testing Strategy
- Node's native test runner (`node --test`), consistent with existing `tests/engine/*` suites.
- New test file (likely `tests/engine/run-cycle.spec-guard.test.ts` or extension of an existing `run-cycle` test file — plan decides) drives `runCycle` against a fixture repo with a workflow whose `spec` step is a bash step (or stubbed agent) that writes a controlled byte payload to stdout.
- Three scenarios:
  1. **Empty**: spec step emits `""` → guard fails, cycle terminates at spec.
  2. **Under-threshold**: spec step emits a ~50-byte string → guard fails with the byte count in the error.
  3. **At-threshold / passing**: spec step emits a payload exactly at `SPEC_MIN_BYTES` and another well above → guard passes, subsequent steps would run (stop the workflow after spec to keep the test focused; assert no failure event).
- Assertions read `.cycle/log.jsonl` in the fixture and walk events — same pattern as existing resume / restart-policy tests.
- No new test framework, no e2e (engine-only change, no UI).

## Documentation Updates
- **CLAUDE.md** — extend the `## Architecture quick reference` bullet list with one entry describing the spec post-condition (threshold value, where the constant lives, that failure produces a normal step failure routed through the standard retry/terminal path). Place it adjacent to the existing `Artifact sanitization` bullet so post-write behaviors cluster.
- **README.md** — no change. Guard is internal engine plumbing with no user-facing surface (no new CLI flag, no new event type).
- **`src/defaults/prompts/spec.md`** — at most one new line under "Output" reminding the agent that a < 200-byte SPEC.md fails the step. Only if it fits without restructuring; otherwise skip.
- Documentation is part of "done" — the `documentation` workflow step picks up any drift, but the CLAUDE.md bullet is in-scope code work for this cycle, not deferred.

## Dependencies
- `src/engine/run-cycle.ts` already exposes the artifact-write seam (`writeFile(join(artifactDir, ...))`) and the `r.status` failure branch — both required for the minimal-surface patch. No refactor.
- `src/engine/sanitize-artifact.ts:sanitizeArtifactStdout` already runs at the write seam — guard measures the sanitized payload it returns, no new sanitizer needed.
- `.cycle/log.jsonl` audit log + existing `step.end status:failed` → `cycle.end status:failed` plumbing already drives terminal-failure retry through `max_cycle_attempts` in `cli.ts`'s drain loop. No queue / drain changes.
- No external services, no env vars, no new dependencies.
