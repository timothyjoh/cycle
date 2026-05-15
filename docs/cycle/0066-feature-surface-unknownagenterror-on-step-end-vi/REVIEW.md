All checks pass. Emit REVIEW.md to stdout. No MUST-FIX file.

```markdown
# Review: Cycle 0066

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Minimal, surgical widening of the failed-`step.end` `stderr` gate from bash-only to status-only, plus two `export` keyword additions to surface the helper for direct unit testing. Five new tests, two doc updates. All SPEC Acceptance criteria are observable in the diff and verified by tests.

### Findings
1. **Code change correctness**: gate at `src/engine/run-cycle.ts:178` now reads `r.status === "failed"` only — matches SPEC requirement and PLAN Task 1 exactly. Helper at `src/engine/run-cycle.ts:27-29` reused unchanged.
2. **Side-effect (positive, not a finding)**: the widening also surfaces stderr for the spec-guard synthesized failure (`formatSpecGuardError` at `src/engine/run-cycle.ts:165`), which previously emitted no `stderr` key on agent-path spec-step failures. Net improvement for operator observability. SPEC §Requirements (`gate is status-only`) is consistent with this — the spec-guard path mutates `r.status = "failed"` before the emit and is the same gate logic.
3. **Export widening justified**: exporting `MAX_STEP_END_STDERR` + `truncateStepEndStderr` is consistent with the precedent at `src/engine/run-cycle.ts:35-58` (exported `findPriorStepHeadSha` for test access). Alternative (in-test agent registry seam) is explicitly out-of-scope per SPEC.
4. **No leftover bash-only conditional**: grep confirms `step.agent === "bash"` no longer appears alongside `r.status === "failed"` in the gate path; the only remaining `step.agent === "bash"` is the legitimate dispatch branch at `src/engine/run-cycle.ts:143`.

### Spec Compliance Checklist
- [x] Acceptance #1 (dispatch path emits `stderr` verbatim, no other shape changes) — `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:60-97`
- [x] Acceptance #2 (head-cap at 2000 with `…`) — `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:133-140`
- [x] Acceptance #3 (existing 3 bash-path tests still pass) — full `npm test` 406/406 green
- [x] Acceptance #4 (successful agent-path omits `stderr`) — `tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:99-131`
- [x] Acceptance #5 (`npm test` passes) — 406/406
- [x] Acceptance #6 (`npm run typecheck`) — clean
- [x] Acceptance #7 (coverage floors) — line 98.99 / branch 92.85 / func 96.99; per-file `triage.ts` 99.45%

## Adversarial Test Review

### Summary
Strong. No mock abuse — fake `claude` is a real binary on PATH (project's preferred anti-mock pattern). Assertions are specific (exact-equality on `stderr`, `exit_code`, `status`, plus `in`-key check). Overflow boundary explicitly tested with strict-`>` proof via the `exact MAX is unchanged` case.

### Findings
1. **Helper duplication acknowledged**: `findStepEnd` / `workflowYml` / `setupRepo` are reimplemented inline from the sibling test file rather than shared. PLAN §"Changes Required" notes this is intentional ("those helpers are not exported"). Acceptable for now; extracting them is a separate refactor (`refl-0065-extract-shared-head-capped-truncate-help` covers the runtime helper; the test-fixture helpers are uncovered by either reflection). Not blocking.
2. **Verbatim assertion is drift-proof**: the test calls `resolveAgent("bogus")` at runtime to read `UnknownAgentError.message`, then asserts the `step.end` `stderr` equals that live value (`tests/engine/run-cycle.step-end-stderr-dispatch.test.ts:60-68`). If the registry list ever changes, the test self-heals — no literal to update.
3. **Boundary precision**: `exact MAX is unchanged` test (line 147-151) proves the gate is strict `>`, matching `src/engine/run-cycle.ts:29`. This catches the easy off-by-one regression where someone "fixes" the helper to `>=`.
4. **No happy-path-only weakness**: dispatch failure, agent success, helper overflow, helper short, helper boundary — five distinct branches.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: 98.99 / 92.85 / 96.99
- Regressions vs base (per-file): none. `src/engine/run-cycle.ts` improved to 100/96.05/100. `src/engine/triage.ts` holds 99.45%.
- New code without tests: none. Two new exports are both exercised; the widened gate's new branch (failed dispatch carries stderr) and preserved branch (successful agent omits stderr) are both hit.
- Specific scenarios missing tests: none required by SPEC. A future "fake agent registry seam → dispatch-path overflow through `runCycle`" integration test is explicitly deferred per PLAN §Out of Scope (out of proportion for the boundary already proven at the unit level).

## Doc-vs-Code Claim Verification

Diff touches `CLAUDE.md` and `docs/ARCHITECTURE.md` — Pass 3 applies.

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "Failed `step.end` events carry a head-capped `stderr` field (2000-char convention, slice to `MAX-1` + `…`)" | `CLAUDE.md:79` | `src/engine/run-cycle.ts:27-29` | OK |
| "mirroring the `engine.paused last_errors[].error` truncation at `src/engine/triage.ts:231-233`" | `CLAUDE.md:79` | `src/engine/triage.ts:231-233` | OK |
| "successful `step.end` events on all paths omit the field" | `CLAUDE.md:79` | `src/engine/run-cycle.ts:178-180` (conditional spread on `r.status === "failed"`) | OK |
| "Gate is `r.status === "failed"` (any agent)" | `CLAUDE.md:79` | `src/engine/run-cycle.ts:178` | OK |
| "real subprocess failure in `execBashStep` (bash agent)" | `CLAUDE.md:79` | `src/engine/run-cycle.ts:143-144` | OK |
| "dispatch-time `UnknownAgentError` synthesis at `src/engine/run-cycle.ts:149-155`" | `CLAUDE.md:79` | `src/engine/run-cycle.ts:149-155` | OK |
| "the exported `MAX_STEP_END_STDERR` constant + `truncateStepEndStderr` helper" | `CLAUDE.md:79` | `src/engine/run-cycle.ts:27` (`export const`) + `:28` (`export const`) | OK |
| "Failed `step.end` events (any agent) carry a head-capped `stderr` field (2000-char convention, slice to `MAX-1` + `…`)" | `docs/ARCHITECTURE.md:262-263` | `src/engine/run-cycle.ts:27-29` + `:178` | OK |
| "Both bash-step subprocess failures and dispatch-time `UnknownAgentError` synthesis surface here" | `docs/ARCHITECTURE.md:264-265` | `src/engine/run-cycle.ts:143-144` (bash) + `:149-155` (dispatch) | OK |
| "Successful `step.end` events on all paths omit the field" | `docs/ARCHITECTURE.md:266` | `src/engine/run-cycle.ts:178-180` | OK |
| Example JSONL `{"event":"step.end",…,"status":"failed","exit_code":1,"stderr":"npm test failed: …"}` | `docs/ARCHITECTURE.md:269` | `src/engine/run-cycle.ts:173-181` (event shape) | OK |

No unbacked claims. No drift.
