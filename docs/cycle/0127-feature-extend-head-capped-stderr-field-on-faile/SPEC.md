The engine captures stdout to write the spec file. Here it is:

---

# SPEC — Cycle 0127: Extend Head-Capped stderr Field to Agent-Path Failures

## Objective

Cycle 0065 shipped a head-capped `stderr` field on failed `step.end` events gated on `step.agent === "bash" && r.status === "failed"`. That gate has since been relaxed to `r.status === "failed"` in master, so the production code already surfaces `stderr` for all agents. What is missing is regression-test coverage for the three agent-path failure shapes explicitly deferred in the cycle 0065 review, plus a minor doc update to confirm the gate is universal. This cycle closes that gap: targeted tests pin the agent-path behavior and `docs/ENGINE.md` is updated to list all three emission sites.

## Source Issue

`refl-0065-extend-step-end-stderr-surface-to-agent` — "Extend head-capped stderr field on failed step.end to agent-path failures (claudecode/codex/gemini)"

## Scope

### In Scope

- Regression tests for the three agent-path failure shapes: spec post-condition guard failure, provider-module non-zero exit (fake binary on PATH), and over-2000-byte truncation on the agent path.
- `docs/ENGINE.md` § "Failed step.end stderr": extend to list all three emission sites and confirm no bash-only qualification remains.
- AC 7 coordination: confirm `refl-0029-spec-acceptance-bullet-6-deferred-to-wro` is already in `done/` and note the closure in BUILD.md.

### Out of Scope

- Changing the `stderr` field name (stays `stderr`, not `stderr_excerpt`).
- Changing the 2000-char cap (`MAX_STEP_END_STDERR`).
- Extracting `truncateStepEndStderr` into a shared module (deferred under `refl-0065-extract-shared-head-capped-truncate-help`; three-caller threshold not yet met).
- Streaming stderr live during step execution.
- Changes to the production gate in `run-cycle.ts` — the gate is already `r.status === "failed"` on master.

## Requirements

- The three agent-path failure shapes must each have at least one integration test exercising `runCycle` end-to-end (not mocking `truncateStepEndStderr`).
- New tests go in `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` (extend the existing file).
- `docs/ENGINE.md` § "Failed step.end stderr" must enumerate the three emission sites and must not qualify the gate as bash-only.
- `refl-0029-spec-acceptance-bullet-6-deferred-to-wro` in `done/` must be cited in BUILD.md as subsumed by this cycle.

## Acceptance Criteria

- [ ] **AC-1 (spec guard test):** A test verifies that a failing `spec` step (post-condition guard: stdout < `SPEC_MIN_BYTES`) emits `step.end` with `status: "failed"` and a non-empty `stderr` field containing the formatted guard error from `formatSpecGuardError`. Uses a fake `claudecode` binary that exits 0 with stdout shorter than 200 bytes.
- [ ] **AC-2 (provider non-zero exit test):** A test exercises a provider step where a fake binary on PATH exits non-zero with stderr output, and confirms the `step.end` event carries `stderr` equal to that output verbatim (when under 2000 chars).
- [ ] **AC-3 (over-2000-byte agent path test):** A test uses a fake binary emitting 2500 `x` chars to stderr (exits 1) and confirms `step.end.stderr` is exactly 2000 chars ending in `…`.
- [ ] **AC-4 (successful agent step.end unchanged):** Existing test "successful agent step.end omits stderr key" in `run-cycle.step-end-stderr-dispatch.test.ts` continues to pass without modification.
- [ ] **AC-5 (ENGINE.md accurate):** `docs/ENGINE.md` § "Failed step.end stderr" enumerates all three failure sources (dispatch/`UnknownAgentError`, spec post-condition guard, provider-module non-zero exit) and states the gate as `r.status === "failed"` across all agents.
- [ ] **AC-6 (refl-0029 subsumed):** `docs/cycle/issues/done/refl-0029-spec-acceptance-bullet-6-deferred-to-wro.md` exists; BUILD.md notes that this cycle subsumes that raw's intent (surface `UnknownAgentError` via dispatch path) via the unified `stderr` field.
- [ ] All existing tests still pass (`npm test`).
- [ ] `npm run test:coverage` passes; `src/engine/run-cycle.ts` line/branch coverage does not regress vs master baseline.
- [ ] No compiler/linter warnings (`npm run typecheck`).

## Testing Strategy

- **Framework:** Node built-in test runner (`node:test`) — matches the existing `run-cycle.step-end-stderr-dispatch.test.ts` pattern.
- **New tests go in:** `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts` (append to the existing file).
- **AC-1 (spec guard):** Repo with a `spec`-named `claudecode` step. Fake `claude` binary on PATH exits 0 and prints fewer than 200 bytes to stdout. Confirm `step.end.status === "failed"` and `step.end.stderr` contains the guard error text.
- **AC-2 (provider non-zero):** Repo with a `claudecode` step. Fake `claude` binary exits 1 and writes `"agent failed: detail\n"` to stderr. Confirm `step.end.stderr === "agent failed: detail\n"`.
- **AC-3 (over-2000-byte):** Fake binary emits 2500 `x` chars to stderr and exits 1. Confirm `step.end.stderr.length === 2000` and `step.end.stderr.endsWith("…")`.
- No E2E or UI tests required — this is a pure log-emission change.

## Documentation Updates

- **`docs/ENGINE.md`** § "Failed step.end stderr": extend the existing two-sentence section to add a sentence listing the three emission sites: `UnknownAgentError` during dispatch (`run-cycle.ts:~219`), spec post-condition guard (`run-cycle.ts:~233`), and provider-module non-zero exit (`exec-claudecode.ts` / `exec-codex.ts` / `exec-gemini.ts`).
- **`CLAUDE.md`**: no change required — this file does not document the `stderr` field.
- **`README.md`**: no change required — internal log event, not user-facing API.

## Dependencies

- `truncateStepEndStderr` and `MAX_STEP_END_STDERR` exported from `src/engine/run-cycle.ts` — already present.
- `resolveAgent` / `UnknownAgentError` from `src/engine/exec.ts` — already present.
- `SPEC_MIN_BYTES` and `formatSpecGuardError` in `src/engine/run-cycle.ts` — verify exportability; if not exported, tests must trigger the guard via `runCycle` end-to-end (preferred).
- `refl-0029-spec-acceptance-bullet-6-deferred-to-wro` in `done/` — already present, no additional work.
