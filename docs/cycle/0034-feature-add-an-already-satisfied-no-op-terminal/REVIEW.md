# Review: Cycle 0034

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, well-scoped implementation of the marker-gated no-op resolution exactly as the SPEC and PLAN specify. The empty-diff guard is correctly augmented to consult `NOOP.md` only on an empty diff, the new events and lifecycle drain are wired through both supervisor loops, and every degrade path fails *closed* to the existing `formatEmptyDiffGuardError` failure (anti-slop preserved). All gates pass: `npm run test:coverage` (987/987), `npm run check:coverage`, `npm run check:invariants`, and `npm run typecheck` are clean; `src/defaults/` and `.cycle/` prompts are in sync.

### Findings
1. **Failure handling (fail-closed, correct)**: The `try/catch` around `classifyNoopMarker` and the reader's own internal `catch` both degrade to `{ valid: false }` → the existing failure path, never a spurious success — `src/engine/run-cycle.ts:672-678`, `src/engine/noop-marker.ts:43-50`. This is the safe direction (an unreadable/malformed marker can never smuggle a fabricated "done").
2. **Observability (no silent failure)**: `readCycleNoop` returning `undefined` is surfaced via `engine.warning { reason: "noop_reason_unreadable" }` before the drain proceeds — `src/cli.ts:468-470`, `src/cli.ts:599-601`. The `noopDrain` mutate-failure fallback emits `queue.drain_warning` with the cause — `src/engine/issue-lifecycle.ts:147-151`.
3. **Accounting correctness**: The exit-3 branch sits *before* the `exitCode === 0` commit branch in both the main loop (`src/cli.ts:593-603`) and `runResumeOnce` (`src/cli.ts:464-473`); it skips `commitCycle`, calls neither `recordTerminalFailure` nor `terminalDrain`/`drainRetry`, and leaves `consecutiveFailures`/`failedCycles`/fast-fail counters untouched. This is verified end-to-end by the supervisor test with `max_consecutive_failures: 1` and two moot issues that must *not* halt — `tests/cli/noop-drain.test.ts:88-99`.
4. **step.end / cycle.end ordering**: `r.status` is left `"ok"` so `step.end` fires `status: "ok"`; the `cycle.noop` + `cycle.end{noop}` return is performed *after* `step.end` and *before* the failure handler, so the early return flows through the unchanged `finally` cleanup — `src/engine/run-cycle.ts:745-761`. Confirmed by asserting `cycle.checkout`/`cycle.base_pull` both fire on the no-op path (`tests/engine/noop-resolution.test.ts:118-120`).
5. **Evidence regex is appropriately strict**: `EVIDENCE_RE = /[\w./-]+\.\w+:\d+\b/` requires a dotted filename + `:digits`, so a bare `reason:` line and a time like `12:30` do not count as evidence — `src/engine/noop-marker.ts:20`, pinned in `tests/engine/noop-marker.test.ts:39-56`.
6. **Minor (non-blocking) — `noopDrain` re-run wrinkle**: a second `noopDrain` invocation on an already-drained issue would enter the mutate-failure fallback (todo ENOENT) and overwrite the `done/` file with an empty body + `drain_error` stamp — `src/engine/issue-lifecycle.ts:124-158`. Not reachable in normal flow (the queue row is removed by `drainOk` and the cycle is processed once), and it mirrors the established `terminalDrain` pattern exactly, so this is a pre-existing shape, not a regression. No action required.

### Spec Compliance Checklist
- [x] No-op fires only on build/fix exit 0 + empty `src scripts tests` diff + valid `NOOP.md` (recognized reason + ≥1 evidence line) — `run-cycle.ts:660-686`, `noop-marker.ts:25-37`
- [x] `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` emitted exactly once, then `cycle.end { status: "noop" }` — `run-cycle.ts:749-755`; cardinality-pinned in `noop-resolution.test.ts:93-104`
- [x] No-op issue moves to `done/` with reason stamps; no retry; `consecutive_failures`/`failedCycles` untouched — `issue-lifecycle.ts:91-166`, `cli.ts:593-603`
- [x] Marker-absent empty-diff path produces identical `formatEmptyDiffGuardError` failure/routing — `run-cycle.ts:681-684`; regression-pinned in `noop-resolution.test.ts:170-191`
- [x] No-op early return flows through existing `finally` checkout/base-pull — verified `noop-resolution.test.ts:118-120`
- [x] Malformed marker (unrecognized reason / zero evidence) falls through to failure — `noop-marker.ts:36`; `noop-resolution.test.ts:193-241`
- [x] Internal marker-check error degrades to failure, never swallowed success — `run-cycle.ts:675-677`
- [x] No-op does not trip completion-proof (`NOOP.md` not in `STEP_ARTIFACTS`; non-empty `BUILD.md` summary required) — `noop-resolution.test.ts:113-117`
- [x] `## Acceptance Criteria` present with testable bullets (SPEC.md:117-137); SPEC→PLAN traceability re-quotes every AC bullet verbatim with covering task (PLAN.md:383-393)
- [x] CONCRETE USER BENEFIT delivered — already-satisfied issue lands in `done/` and the engine does not halt; proven end-to-end via the real `dist/cycle.js` run in `noop-drain.test.ts:99-133`
- [x] CLAUDE.md + docs/ENGINE.md updated; README intentionally unchanged (no new CLI surface) — consistent with SPEC Documentation Updates

## Adversarial Test Review

### Summary
Strong. Tests use real temp git repos, real `git`, and real fake-agent shell scripts (no `mock.method` on `node:fs`), exercising the engine and the full supervisor binary end-to-end. Failure paths, boundary conditions, and accounting invariants are all covered with specific assertions, and exactly-once events are cardinality-pinned via `filter(...).length === 1`.

### Findings
1. **Boundary coverage (parser)**: `noop-marker.test.ts` covers each recognized category, case-insensitivity, empty content, no-reason, unrecognized reason, zero-evidence, first-reason-wins, time-token rejection, and missing-file fail-closed — `tests/engine/noop-marker.test.ts:8-91`. No happy-path-only gap.
2. **Integration not just units**: `noop-drain.test.ts` drives the actual built CLI (`node dist/cycle.js run`) over two moot issues and asserts both land in `done/`, none in `failed/`, queue empties, `engine.halted` count is 0, and `engine.stop.status === "ok"` with `cycles_processed: 2` — `tests/cli/noop-drain.test.ts:99-133`. This directly proves the SPEC's "no halt risk" benefit rather than asserting mechanics.
3. **Assertion quality**: assertions are specific (`noop[0].reason === "already-satisfied"`, `drained.every(e => e.outcome === "noop")`, frontmatter regex `^noop_step: build$`), not weak truthiness checks.
4. **Negative/regression pinning**: marker-absent and two malformed-marker variants each assert `cycle.noop` count is 0 and the `build post-condition failed` message appears — `noop-resolution.test.ts:170-241`.
5. **Fallback path tested**: `noopDrain`'s mutate-failure fallback (incl. the no-frontmatter raw-body branch) and the missing-reason stamp-omission path are covered — `tests/engine/issue-lifecycle.test.ts` (4 added `noopDrain` cases).
6. **Test independence**: every test uses its own `mkdtemp` repo + bin dir and cleans up in `finally`; no shared state or ordering dependence.

### Test Coverage
- Command run: `npm run test:coverage` (987 tests, 987 pass, 0 fail)
- Line / branch / function (touched modules):
  - `src/engine/run-cycle.ts` — **100.00%** / 97.18% / 95.45% (floor ≥ 90%)
  - `src/engine/noop-marker.ts` — **100.00 / 100.00 / 100.00** (new floor 100%)
  - `src/engine/issue-lifecycle.ts` — **98.80%** line / 72.73 branch / 100.00 func (floor ≥ 95%; uncovered 156-157 = non-ENOENT rethrow on the happy rename, a defensive error path mirroring `terminalDrain`)
  - `src/engine/iteration-guard.ts` — 99.22% line (uncovered 52, pre-existing)
  - `src/cli/run-one.ts` — 72.45% (floor ≥ 70%)
- Regressions vs base (per-file): none
- New code without tests: none
- Specific scenarios missing tests: none material. The PLAN's standalone "missing reason ⇒ supervisor `engine.warning`" integration case is covered instead by `readCycleNoop` unit tests plus the supervisor drain test exercising the branch — an acceptable, documented substitution (BUILD.md "Deviations").

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| Emits `cycle.noop { cycle_id, issue_id, reason, detected_at_step }` | `docs/ENGINE.md:179` | `src/engine/run-cycle.ts:749` | OK |
| Then `cycle.end { status: "noop" }` | `docs/ENGINE.md:179` | `src/engine/run-cycle.ts:755` | OK |
| `run-one` maps `noop` → exit code **3** (ok⇒0, other⇒1, thrown⇒2) | `docs/ENGINE.md:183` | `src/cli/run-one.ts:94` | OK |
| Reason category ∈ `already-satisfied \| duplicate \| not-actionable` | `docs/ENGINE.md:177`, `CLAUDE.md:121` | `src/engine/noop-marker.ts:6-10` | OK |
| Evidence = `<path>.<ext>:<line>` token; `reason:` line never counts | `docs/ENGINE.md:177` | `src/engine/noop-marker.ts:20` | OK |
| `classifyNoopMarker` fails closed (absent/unreadable ⇒ invalid) | `docs/ENGINE.md:177` | `src/engine/noop-marker.ts:43-50` | OK |
| `NOOP.md` is **not** in `STEP_ARTIFACTS` | `docs/ENGINE.md:179`, `CLAUDE.md:83` | `src/engine/run-cycle.ts` (no `NOOP` entry in `STEP_ARTIFACTS`) | OK |
| `noopDrain` moves to `done/` with `noop_at`/`noop_reason`/`noop_step`/`last_cycle_id` stamps | `docs/ENGINE.md:183`, `CLAUDE.md:83` | `src/engine/issue-lifecycle.ts:104-108` | OK |
| Emits `queue.drained { outcome: "noop", reason }` | `docs/ENGINE.md:183` | `src/engine/issue-lifecycle.ts:160-165` | OK |
| Reason recovered via `readCycleNoop` | `docs/ENGINE.md:183` | `src/engine/iteration-guard.ts:65` | OK |
| Unreadable ⇒ `engine.warning { reason: "noop_reason_unreadable" }` and still drains | `docs/ENGINE.md:183`, `CLAUDE.md:83` | `src/cli.ts:469`, `src/cli.ts:600` | OK |
| Skips `commitCycle`; does not retry; `consecutive_failures`/`failedCycles` untouched | `CLAUDE.md:83`, `docs/ENGINE.md:183` | `src/cli.ts:593-603` | OK |
| Build/fix prompt: write `NOOP.md` with `reason:` + `## Evidence` `file.ext:line` | `src/defaults/prompts/build.md:81-103` | `src/engine/noop-marker.ts:20-21` (parser contract) | OK |

All enumerated doc claims are backed; `.cycle/prompts/build.md` and `.cycle/prompts/fix.md` are byte-identical to their `src/defaults/` sources.
