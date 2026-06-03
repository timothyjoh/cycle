## Summary

This cycle adds a marker-gated **no-op / already-satisfied** terminal cycle resolution at the build/fix empty-diff guard, so an issue whose work is already done resolves cleanly to `done/` instead of failing and burning the consecutive-failure budget. All seven PLAN.md tasks are complete.

**Files created (4):** `src/engine/noop-marker.ts` (52 lines — the pure `parseNoopMarker` + fail-closed `classifyNoopMarker` reader, with `NOOP_REASONS`); `tests/engine/noop-marker.test.ts` (104 lines), `tests/engine/noop-resolution.test.ts` (231 lines — end-to-end engine tests on the empty-diff harness), and `tests/cli/noop-drain.test.ts` (135 lines — full-supervisor test).

**Files modified (16):** `src/engine/run-cycle.ts` (+~40 lines: import the reader; declare a per-step `noopOutcome`; insert the marker check into the empty-diff guard so a valid marker sets `noopOutcome` while leaving `r.status="ok"`, malformed/absent/error preserves `formatEmptyDiffGuardError`; emit `cycle.noop` + `cycle.end{noop}` and return `{status:"noop",reason,detectedAtStep}` after `step.end`, before the failure handler). `src/cli/run-one.ts` (+2 lines: map `noop`→exit 3). `src/engine/iteration-guard.ts` (+33 lines: `readCycleNoop`, fail-closed log reader). `src/engine/issue-lifecycle.ts` (+90 lines: `noopDrain` mirroring `terminalDrain`'s tmp+rename fallback but landing in `done/`, stamping `noop_at`/`noop_reason`/`noop_step`/`last_cycle_id`, emitting `queue.drained{outcome:"noop"}`; imports `drainOk`). `src/cli.ts` (+~30 lines: import `noopDrain`/`readCycleNoop`; extend `ResumeOutcome` with `"noop"`; guard `readCycleEndFailure`/`readCycleNoop` with `exitCode!==3`; add the exit-3 branch in both the main loop and `runResumeOnce` that skips `commitCycle`, drains to `done/`, and leaves accounting untouched; emit `engine.warning{noop_reason_unreadable}` when the reason is unreadable). `src/defaults/prompts/build.md` and `src/defaults/prompts/fix.md` (added "If the work is already done (no-op)" sections; propagated via `npm run sync-defaults` → `.cycle/prompts/build.md`, `.cycle/prompts/fix.md`). `scripts/coverage-gate.mjs` (added the `src/engine/noop-marker.ts: 100` floor). `CLAUDE.md` and `docs/ENGINE.md` (documented the event, marker schema, `done/` lane, exit-code-3 channel, and no-retry / `consecutive_failures`-untouched semantics). Test fixtures updated in `tests/scripts/coverage-gate.test.ts` (three LCOV maps), `tests/engine/iteration-guard.test.ts` (`readCycleNoop` cases), `tests/engine/issue-lifecycle.test.ts` (`noopDrain` cases), and `tests/cli/run-one.test.ts` (exit-3 case).

**Test suite:** `npm test` → **987 tests, 987 pass, 0 fail (exit 0)**. Gates run explicitly: `npm run check:coverage`, `npm run check:invariants`, and `npm run typecheck` all clean.

**Coverage** (`npm run test:coverage`): per-file floors all met — `src/engine/run-cycle.ts` **100.00%** line / 97.18% branch / 95.45% func (≥90 floor; up from baseline, no regression); `src/engine/noop-marker.ts` **100.00 / 100.00 / 100.00** (new, 100 floor); `src/engine/issue-lifecycle.ts` **98.80%** line (≥95); `src/cli/run-one.ts` **72.45%** (≥70); `src/engine/iteration-guard.ts` 99.22% line. No per-file regressions.

**Failure modes handled, and their tests:** (1) *marker absent* → existing `formatEmptyDiffGuardError` failure preserved byte-for-byte (`noop-resolution: marker ABSENT…`); (2) *malformed marker* — missing/unrecognized reason category or zero `file.ext:line` evidence → invalid → falls through to failure (`parseNoopMarker` unit cases + two engine `MALFORMED marker…` tests); (3) *unreadable/absent marker file* → `classifyNoopMarker` fail-closed returns `{valid:false}`, no throw (`classifyNoopMarker: missing file…`); (4) *internal error in the marker check* → wrapped in `try/catch` degrading to the failure path (never a swallowed success); (5) *terminal-lane move I/O error* → `noopDrain`'s `mutateFrontmatter`-failure fallback writes via tmp+rename and emits `queue.drain_warning` (`noopDrain: mutate-failure fallback…`, `…no frontmatter` cases); (6) *unreadable `cycle.noop` reason in the supervisor* → `engine.warning{noop_reason_unreadable}` and still drains (`readCycleNoop` degradation unit-tested). Idempotency: a no-op produces no commit and no `src/scripts/tests` mutation, so a re-run re-reads the same `NOOP.md` and re-derives the same outcome; `drainOk` filters the queue row and the todo→done rename tolerates an already-moved file (ENOENT swallowed).

**Deviations from PLAN.md:** none material. The planned per-reason supervisor parametrization is covered at the engine level (`noop-resolution: reason category propagates verbatim`) plus a supervisor-level full-engine test; the planned standalone "missing reason ⇒ engine.warning" supervisor integration test was omitted because the fake agent always emits a reason — that degrade path is covered by the `readCycleNoop` unit tests and the supervisor branch is exercised by the no-op drain test.

**Deferred / follow-up:** the research-phase early-rejection short-circuit remains explicitly out of scope (sibling cycle). Per SPEC, README.md was intentionally not changed — there is no new user-facing CLI surface (no new flag or command); the only observable change is `done/` placement plus the `cycle.noop` log event, already documented in ENGINE.md/CLAUDE.md. The no-op artifacts (`NOOP.md`/`BUILD.md`) are left uncommitted, consistent with the existing empty-diff path (noted in ENGINE.md).

## Touched Files
- src/engine/noop-marker.ts
- src/engine/run-cycle.ts
- src/cli/run-one.ts
- src/engine/iteration-guard.ts
- src/engine/issue-lifecycle.ts
- src/cli.ts
- src/defaults/prompts/build.md
- src/defaults/prompts/fix.md
- .cycle/prompts/build.md
- .cycle/prompts/fix.md
- scripts/coverage-gate.mjs
- CLAUDE.md
- docs/ENGINE.md
- tests/engine/noop-marker.test.ts
- tests/engine/noop-resolution.test.ts
- tests/engine/iteration-guard.test.ts
- tests/engine/issue-lifecycle.test.ts
- tests/cli/run-one.test.ts
- tests/cli/noop-drain.test.ts
- tests/scripts/coverage-gate.test.ts
- docs/ARCHITECTURE.md
