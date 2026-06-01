# Review: Cycle 0020

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A tight, single-purpose change that branches the `"nonempty"` completion-proof failure message on `r.timedOut` so a SIGTERM-killed step's `step.end.stderr` no longer contradicts its non-zero `exit_code` with `"exited 0"` wording. The implementation is minimal (one pure formatter + a one-line ternary), preserves all routing/event behavior verbatim, and is fully covered. Builds, typecheck, full suite, coverage gate, and structural invariants all pass.

### Findings
1. **Correctness**: The new formatter `formatTimeoutProofError(stepName, artifactPath, exitCode)` is a pure single-expression template literal mirroring its sibling `formatCompletionProofError`, and deliberately omits the `"exited 0"` substring — `src/engine/run-cycle.ts:199`.
2. **Minimal blast radius**: The branch is confined to the `"nonempty"` arm; the downstream `step.completion_check` emission, the `if (proofError)` failure assignment, and the `else if (r.timedOut)` salvage branch are byte-for-byte unchanged — `src/engine/run-cycle.ts:512-535`. Because salvage is reached only when `proofError` is null, the new wording never interacts with the salvage path.
3. **Exit-code honesty**: `r.exitCode` is interpolated from the actual signal-derived result rather than hard-coded to `143`, which is robust to the claudecode lane reporting `-1` — `src/engine/run-cycle.ts:515`. `r.exitCode` is typed `number` on `StepResult`, so no `?? 143` fallback was required (PLAN open question resolved correctly).
4. **Failure handling**: This governs message text on an already-failing path — no new I/O, subprocess, or network surface. The message is non-empty by construction, `r.status="failed"` + non-zero `r.exitCode` route through the unchanged `max_cycle_attempts` retry path, and nothing is swallowed. No fail-open default, no non-idempotent operation introduced (pure post-condition on an in-memory `StepResult`).
5. **Documented deviation handled correctly**: BUILD.md records that the killed `claude` step reports `exit_code: -1` (not the shell-spawned `143`); the formatter's interpolation absorbs this and the test regex accepts `-?\d+`. The docs hedge with "typically `exit_code: 143`", which remains accurate.

### Spec Compliance Checklist
- [x] AC1 — timed-out empty-artifact step emits timeout wording referencing "timed out" + exit code, no `exited 0` substring (`src/engine/run-cycle.ts:514-516`; test asserts `/review timed out \(exit -?\d+\)/` + `doesNotMatch(/exited 0/)`)
- [x] AC2 — clean exit-0 empty-artifact path keeps `formatCompletionProofError` wording unchanged (`src/engine/run-cycle.ts:516`; existing regression test augmented with `doesNotMatch(/timed out/)` pin)
- [x] AC3 — timed-out-empty path keeps `r.status="failed"` + non-zero `r.exitCode` (downstream handler reused verbatim, `src/engine/run-cycle.ts:525-528`; e2e asserts failed result + non-zero `exit_code`)
- [x] AC4 — `step.completion_check` emitted exactly once with `status:"fail"`, cardinality-pinned via `filter(...).length === 1`
- [x] AC5 — all existing tests pass (878/878)
- [x] AC6 — `npm run typecheck` clean, no warnings
- [x] SPEC has a `## Acceptance Criteria` section with ≥1 testable bullet (6 bullets)
- [x] PLAN includes a complete `## SPEC Acceptance Traceability` section re-quoting every SPEC acceptance bullet verbatim, each paired with a covering task id
- [x] Out-of-scope respected — `spec-min-bytes`/`fix-conditional` branches, routing, `step.timeout`/`step.timeout_salvaged`, and timeout limits all unchanged
- [x] Docs updated per SPEC — CLAUDE.md + docs/ENGINE.md; AGENTS.md absent (correctly skipped); README unchanged (no user-facing surface)

## Adversarial Test Review

### Summary
Strong. Tests drive the real engine end-to-end through actual subprocess timeout/kill behavior — no mocks, real git repos, real fake-`claude` shell scripts on a temp PATH. Both arms of the new ternary are exercised, assertions are specific, and event cardinality is pinned per CLAUDE.md convention.

### Findings
1. **Real failure simulation**: The timeout branch is driven by a genuine hang (`sleep 30`) against a `200 ms` `step_timeout_ms`, a ~150× margin that keeps the SIGTERM kill firing well before stdout — `tests/engine/run-cycle.completion-proof.test.ts:249-289`. This is real timeout behavior, not a stubbed `r.timedOut`.
2. **Branch separation pinned both ways**: The new test asserts `doesNotMatch(/exited 0/)` and the exit-0 regression test gained `doesNotMatch(/timed out/)` — neither path can silently adopt the other's wording (`tests/engine/run-cycle.completion-proof.test.ts:172`, `:283`).
3. **Salvage regression present**: A write-then-hang fake confirms a non-empty artifact still takes the `step.timeout_salvaged` accept path (`status:"ok"`), proving the message branch does not perturb salvage — `tests/engine/run-cycle.completion-proof.test.ts:296-347`.
4. **Assertion quality**: Specific equality/regex assertions (`assert.equal(checks[0].status, "fail")`, `assert.notEqual(ends[0].exit_code, 0)`), not weak truthiness checks. Formatter unit test pins exact string equality plus shape regexes.
5. **Cardinality discipline**: `step.completion_check`, `step.end` (failed), and `step.timeout_salvaged` are each asserted via `filter(...).length === 1`, satisfying the exactly-once convention.
6. **Test independence**: Each test provisions its own temp repo + bin dir and cleans up in `finally`; no shared state or ordering dependency.

### Test Coverage
- Command run: `npm run test:coverage`
- `src/engine/run-cycle.ts`: 100.00% line / 96.82% branch (reported in BUILD.md) / 100.00% per the gate — floor 90%, no regression
- Regressions vs base (per-file): none — all per-file floors pass (`coverage-gate: ok` for every floored file)
- New code without tests: none — both arms of the `r.timedOut` ternary covered (timeout test + salvage test); the formatter has a dedicated unit test
- Specific scenarios missing tests: none material. (Optional nicety: no test pins the literal interpolated `-1` exit code, but this is by design — the lane-dependent code is intentionally matched as `-?\d+` to avoid CI flake.)

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| `formatTimeoutProofError` provides timeout-specific wording referencing the actual exit code | `CLAUDE.md:74` | `src/engine/run-cycle.ts:199` | OK |
| `"nonempty"` failure message branches on `r.timedOut`; clean exit-0 path keeps `formatCompletionProofError` | `CLAUDE.md:74` | `src/engine/run-cycle.ts:514-516` | OK |
| Routing / `step.completion_check` / `step.timeout_salvaged` behavior unchanged | `CLAUDE.md:74` | `src/engine/run-cycle.ts:519-535` | OK |
| Clean exit-0 message `<step> exited 0 but <artifact> is empty — treating as failure` | `docs/ENGINE.md:145` | `src/engine/run-cycle.ts:195-197` | OK |
| Timed-out message `formatTimeoutProofError(step, artifact, exitCode)` → `<step> timed out (exit <code>) and left <artifact> empty — treating as failure` | `docs/ENGINE.md:146` | `src/engine/run-cycle.ts:199-201` | OK |
| Branch selects timeout formatter when `r.timedOut`, used on SIGTERM-kill (`exit_code` typically 143) | `docs/ENGINE.md:143-148` | `src/engine/run-cycle.ts:514-516` | OK |
| Exit code interpolated from actual `r.exitCode`, not hard-coded | `docs/ENGINE.md:148` | `src/engine/run-cycle.ts:515` | OK |
