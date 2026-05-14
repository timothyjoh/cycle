# SPEC — Cycle 0058: Enforce SPEC.md Non-Empty Contract at Spec Step Boundary

## Objective
Stop empty / near-empty `SPEC.md` artifacts from silently passing the `spec` step and corrupting the downstream `plan` → `build` → `review` chain. Today `runCycle` writes whatever the spec agent emits (post-sanitization) to `<artifactDir>/SPEC.md` and emits `step.end status:ok` regardless of byte count — cycle 0023 produced a 1-byte SPEC.md and `review` had to reconstruct the Spec Compliance Checklist from PLAN.md, collapsing the spec/plan separation the workflow depends on. Adding a post-write byte-floor guard at the existing artifact-write seam in `src/engine/run-cycle.ts` turns this failure mode into a loud, retriable step failure with a greppable error naming file, byte count, and threshold.

## Source Issue
`refl-0023-spec-md-allowed-to-be-empty-in-cycle-wor-enforce-spec-non-empty` — "Enforce SPEC.md non-empty contract before plan/build/review"

## Scope

### In Scope
- Engine-side post-condition guard in `src/engine/run-cycle.ts`: after the existing `writeFile(join(artifactDir, "SPEC.md"), sanitizeArtifactStdout(r.stdout), "utf8")` call for a `spec` step that returned `r.status === "ok"`, measure the sanitized payload's UTF-8 byte length. If `< SPEC_MIN_BYTES` (target value **200**, finalized in plan), mutate the step result to `status: "failed"` with stderr `spec post-condition failed: <abs-path> is N bytes (< THRESHOLD)` before emitting `step.end`, so the existing failed-step branch (`cycle.end status:"failed" failing_step:"spec"`) handles termination and outer-loop retry.
- One regression test under `tests/engine/` driving `runCycle` against a fixture repo whose `spec` step is a bash step (or stubbed agent) writing a controlled payload. Three assertion scenarios: empty (0 bytes) fails, under-threshold (~50 bytes) fails, at-or-above-threshold passes the guard. Asserts via `.cycle/log.jsonl` event walk: `step.end {step:"spec", status:"failed"}`, `cycle.end {status:"failed", failing_step:"spec"}`, no `step.start` for `research` onward, and that the failure path's error string carries path + byte count + threshold.

### Out of Scope
- Generalized `post:` / `assert:` schema in `workflows.yml` for arbitrary step artifacts (issue option 1). Defer until a second post-condition need surfaces — single call-site does not justify a new schema dimension.
- Guarding other artifact files (`PLAN.md`, `BUILD.md`, `REVIEW.md`, `FIX.md`). Only SPEC.md is the contract-bearing artifact this cycle hardens.
- Threshold tuning beyond the initial 200-byte floor. Plan picks the exact number; future calibration is its own reflection issue if 200 proves wrong.
- Backfilling cycle 0023's empty SPEC.md — archaeology, not workflow hardening (per issue Out of Scope).
- Prompt-side hardening beyond at most a single one-line addition in `src/defaults/prompts/spec.md`. The engine guard is the load-bearing fix; prompt tweaks rely on the same agent-compliance assumption that produced the failure.

## Requirements
- Guard runs unconditionally for any step whose `step.name === "spec"`, independent of `wf.no_branch` (dogfood `feature` is trunk-based with `no_branch:true`; consumer default is branch-based — both must enforce).
- Threshold is a single named module constant in `run-cycle.ts` (e.g. `const SPEC_MIN_BYTES = 200`), not a magic number at the call site.
- Byte count is measured on the **post-sanitization** payload (the string returned by `sanitizeArtifactStdout(r.stdout)`), not raw stdout. Sanitization strips narration / fences, so a "200 bytes of `Now I will write the spec…`" stdout that sanitizes to under-threshold must still fail.
- Failure path reuses the existing `r.status === "failed"` branch in the workflow loop — do NOT introduce a parallel exit path. The mutation point is between the artifact `writeFile` and the `step.end` emit.
- `step.end` event for the failing case carries `status: "failed"` and a non-zero `exit_code` (reuse `r.exitCode` if non-zero, else `1`). No new event types, no new event payload keys.
- The `spec` failure falls through to the standard `cycle.end status:"failed" failing_step:"spec"` path — NOT the `reflection` / `documentation` non-fatal branches.
- Boundary is strict `<`: a payload of exactly `SPEC_MIN_BYTES` bytes passes the guard; `SPEC_MIN_BYTES - 1` fails.
- Error message format is greppable and stable: `spec post-condition failed: <abs-path> is <N> bytes (< <THRESHOLD>)`. Path is `join(artifactDir, "SPEC.md")`.

## Acceptance Criteria
- [ ] A stubbed `spec` step that writes a < THRESHOLD-byte payload causes `runCycle` to emit `step.end {step:"spec", status:"failed"}` and `cycle.end {status:"failed", failing_step:"spec"}`, and no subsequent step (`research` onward) emits `step.start`.
- [ ] A stubbed `spec` step writing exactly `SPEC_MIN_BYTES` bytes passes the guard (boundary check confirms `<`, not `<=`).
- [ ] A normal happy-path spec step (existing passing tests) continues to succeed with no behavioral change — no extra events, identical artifact contents.
- [ ] The guard's error string contains the absolute artifact path, the actual byte count, and the threshold value (asserted by regression test).
- [ ] Guard fires for both branch-based and `no_branch:true` workflows (covered by parameterization or two distinct test cases).
- [ ] `src/engine/run-cycle.ts` carries one named constant (`SPEC_MIN_BYTES`) — no inline literals at the call site.
- [ ] `npm test` passes (all existing + new tests).
- [ ] `npm run typecheck` clean.
- [ ] `npm run test:coverage` meets the per-file gate (`src/engine/triage.ts ≥ 95%` untouched) and aggregate baselines (line ≥ 95%, branch ≥ 75%, function ≥ 90%). New lines in `run-cycle.ts` are covered by the new regression test.
- [ ] No compiler / linter warnings introduced.

## Testing Strategy
- Node's native test runner (`node --test`), consistent with existing `tests/engine/*` suites — no new test framework.
- New test file (likely `tests/engine/run-cycle.spec-guard.test.ts`; plan finalizes path / whether to extend an existing run-cycle test file) drives `runCycle` against a fixture repo with a workflow whose `spec` step is wired to emit a controlled byte payload (bash step or a registered stub agent — plan picks the simpler seam).
- Scenarios:
  1. **Empty** — spec step emits `""` → guard fails; assert `step.end status:failed`, `cycle.end failing_step:"spec"`, no `research` `step.start`.
  2. **Under-threshold** — spec step emits a ~50-byte string → guard fails; assert error string carries path + byte count + threshold.
  3. **At-threshold passing** — spec step emits a payload of exactly `SPEC_MIN_BYTES` bytes → guard passes; stop the workflow after spec (truncated workflow fixture) so the test stays focused; assert no failure event for spec.
  4. **Workflow parameterization** — at least one branch-based and one `no_branch:true` workflow exercised, since the guard must fire identically.
- Assertions read `.cycle/log.jsonl` from the fixture and walk events, matching the pattern used by existing resume / restart-policy tests.
- Engine-only change — no UI, no e2e / Playwright.

## Documentation Updates
- **CLAUDE.md** — add one bullet to `## Architecture quick reference` describing the spec post-condition: where `SPEC_MIN_BYTES` lives, what the guard measures (post-sanitization byte length), and that failure routes through the standard step-failure → cycle-failure retry path. Place it adjacent to the existing `Artifact sanitization` bullet so post-write behaviors cluster.
- **README.md** — no change. Guard is internal engine plumbing with no user-facing surface (no new CLI flag, no new event type, no new exit code).
- **`src/defaults/prompts/spec.md`** — at most one new line under "Output" reminding the agent that an under-threshold SPEC.md fails the step. Only if it fits without restructuring; skip otherwise (engine guard is load-bearing regardless).
- Documentation drift is also picked up by the `documentation` workflow step, but the CLAUDE.md bullet is in-scope for this cycle, not deferred.

## Dependencies
- `src/engine/run-cycle.ts` already exposes the artifact-write seam at line ~147 (`writeFile(join(artifactDir, …), sanitizeArtifactStdout(r.stdout), "utf8")`) and the `r.status === "failed"` branch at ~154. Both required for the minimal-surface patch — no refactor.
- `src/engine/sanitize-artifact.ts:sanitizeArtifactStdout` is already invoked at the write seam — guard measures the sanitized payload it returns; no new sanitizer needed.
- `.cycle/log.jsonl` audit log + existing `step.end status:failed` → `cycle.end status:failed` plumbing already drives terminal-failure retry through `max_cycle_attempts` in `cli.ts`'s drain loop. No queue / drain changes.
- No external services, no env vars, no new npm dependencies.
