Now emit REVIEW.md to stdout:

```markdown
# Review: Cycle 0017

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (2 minor items: stale halt metadata leak in `engine.stop`, missing SPEC-mandated cumulative-counter integration test for resume + main-loop terminals)

## Code Quality Review

### Summary
Implementation is solid. `propagateBlocked` follows the planned BFS-with-rollback shape, mutations are ordered correctly (frontmatter → file rename → queue write at end), and the CLI counter rewire is faithful to SPEC. Coverage of `src/engine/blocked.ts` is excellent (97.26% line / 95.45% branch / 100% func). Two minor issues affect log fidelity and SPEC test coverage but do not break behavior.

### Findings
1. **Bug — stale halt metadata in engine.stop**: `lastHaltContext` is set on every terminal failure (`src/cli.ts:288` resume, `src/cli.ts:366` main loop) but never cleared on success. After "fail → success" with threshold ≥ 2, `engine.stop {status: "ok", halted_at_issue: <prior failed id>, failing_step: ...}` fires with contradictory metadata. — `src/cli.ts:282-284`, `src/cli.ts:357-358`, `src/cli.ts:388-390`
2. **Code smell — non-null assertion on union return**: `result.issueId!` at `src/cli.ts:288` works only because `runResumeOnce` always populates `issueId` when `outcome === "terminal"`. The `ResumeResult` type doesn't enforce that invariant. Consider a discriminated union (`{outcome: "terminal", issueId: string, failingStep?: string}` vs `{outcome: "ok"|"skipped", ...}`) so `!` becomes unnecessary. Minor. — `src/cli.ts:30-35`, `src/cli.ts:288`
3. **Defensive but redundant guard**: `failedCycles.length > 0` at `src/cli.ts:375` cannot be false when `haltReason === "max_consecutive_failures"` (every increment of `consecutiveFailures` also pushes to `failedCycles`). Cosmetic. — `src/cli.ts:375`
4. **Missing function-level docstring on `propagateBlocked`**: PLAN explicitly called for documenting the rollback caveat (rolled-back files retain `blocked_at`/`blocked_by` frontmatter as a known stale-stamp side-effect). Only an inline closure comment exists. — `src/engine/blocked.ts:10-14`
5. **Rollback errors silently swallowed**: The rollback closure at `src/engine/blocked.ts:48-54` does `try { rename(dst, src) } catch {}` with no logging. If rollback partially fails, the caller sees only the original error and the filesystem may be inconsistent. PLAN accepted this trade-off, but a `log.emit("queue.drain_warning", {…})` here would make corruption observable. Minor. — `src/engine/blocked.ts:48-54`
6. **Branch reuse silently checks out existing branch**: `createCycleBranch` now does `git checkout <branch>` instead of `git checkout -b` when the branch exists (`src/engine/branch.ts:31-35`). This correctly handles retries, but if the existing branch contains uncommitted changes from a stale partial cycle, the checkout could surface unexpected files. Acceptable per PLAN deviation note. No fix needed; flagging for awareness. — `src/engine/branch.ts:17-26, 31-35`

### Spec Compliance Checklist
- [x] `propagateBlocked` moves direct dependents from `todo/` to `blocked/`, writes `blocked_by` frontmatter, drops rows, emits `issue.blocked` per moved file
- [x] Transitive dependents end in `blocked/` with chain captured (immediate-predecessor convention as planned)
- [x] Rows with empty/non-overlapping `depends_on` untouched
- [x] In-progress row whose `depends_on` includes `failedId` is also moved
- [x] CLI loop survives one cycle failure and pops next eligible row when `max_consecutive_failures >= 2`
- [x] Two consecutive cycle terminal failures emit `engine.halted` with both ids and exit non-zero
- [x] Fail → success → fail does NOT halt (counter resets) — verified by `tests/cli/halt.test.ts:141`
- [x] `--dry-run` skips propagation and counter
- [x] `engine.halted` payload includes `{failed_cycles, reason, threshold}`
- [x] CLAUDE.md updated with both new bullets and the retry-branch-reuse note
- [x] Coverage ≥ 95% line, ≥ 75% branch, ≥ 90% function (96.27 / 88.44 / 94.69)
- [x] All 216 existing tests pass under new semantics
- [ ] **Resume-terminal counts toward counter** (SPEC §Requirements bullet) — implemented in code but no integration test verifies cumulative behavior with subsequent main-loop terminals
- [ ] **`engine.stop` metadata clean** — implementation leaks `halted_at_issue`/`failing_step` into successful-run stop events when a prior cycle failed

## Adversarial Test Review

### Summary
Test quality is strong. Real filesystem fixtures, real `mkdtemp` isolation, real `chmod` for the rollback test, no mock-the-DB-style abuse. The propagate end-to-end test exercises the full CLI path through `terminalDrain → propagateBlocked`. One SPEC-mandated cumulative-counter scenario is missing.

### Findings
1. **Missing integration test for resume-terminal + main-loop-terminal cumulative halt** — SPEC §Requirements explicitly states "Resume of an in-flight cycle that exits terminal-failed counts toward the counter as if it had just failed." `tests/cli/resume.test.ts:360` proves resume-terminal can halt on its own (with threshold 1); no test proves resume-terminal contributes to the same counter that main-loop terminals increment, which is the more subtle SPEC promise. PLAN Task 3 explicitly called for this test. — `tests/cli/halt.test.ts` (gap)
2. **Rollback test passes no logger** — `tests/engine/blocked.test.ts:212` (rollback after partial moves) does not pass a logger, so we can't verify "no `issue.blocked` events emitted on rollback." Minor — code structure makes this implicit, but explicit assertion would catch a future refactor that emits early. — `tests/engine/blocked.test.ts:212-234`
3. **Weak assertion on no-overlap propagate event payload** — `tests/engine/blocked.test.ts:172-174` asserts a single `queue.propagate_blocked` event fires but doesn't assert its payload (`blocked: []`, `issue_id: "A"`). Minor; the no-rows test at `:65-68` does assert payload, so the surface is partially covered. — `tests/engine/blocked.test.ts:156-177`
4. **Defensive event-filter pattern** — `tests/cli/halt.test.ts:129-131` filters all `engine.stop` events and takes the last, but only one is ever emitted. Cosmetic, not wrong. — `tests/cli/halt.test.ts:129-131`
5. **`tests/cli/halt.test.ts` retry test mixes counter semantics** — The retry test (`:194-228`) uses a per-issue file counter inside the bash script, which is a fine harness pattern but couples the test to bash filesystem state. A minor refactor to use `$CYCLE_ATTEMPT` env (if exposed) or a simpler N-fail counter would reduce coupling. Acceptable as-is. — `tests/cli/halt.test.ts:194-228`

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **96.27% / 88.44% / 94.69%** (baseline 95 / 75 / 90 — all met)
- Per-file (relevant): `src/engine/blocked.ts` 97.26 / 95.45 / 100; `src/engine/branch.ts` 98.55 / 91.30 / 88.24; `src/cli.ts` not in report (entry-point script, integration-tested via spawned bundle as established pattern)
- Regressions vs base (per-file): none
- New code without tests: none directly — `src/cli.ts` counter logic is covered indirectly via `tests/cli/halt.test.ts` (5 cases) + `tests/cli/resume.test.ts` (10 cases) + `tests/cli/queue-drain.test.ts` (6 cases) + `tests/cli/multi-loop.test.ts` (3 cases)
- Specific scenarios missing tests:
  - Resume-terminal contributing to a counter that subsequently trips on a main-loop terminal (SPEC §Requirements explicit; PLAN Task 3 explicit)
  - `engine.stop` metadata cleanliness after fail→success (would catch the `lastHaltContext` leak)
  - `propagateBlocked` rollback path with logger attached (verify no `issue.blocked` events fire on rollback)
- Pre-existing typecheck noise (unrelated to this cycle): `tests/cli/multi-loop.test.ts:53,114` `findLast` lib-target errors — present in baseline per memory, BUILD.md notes
```

REVIEW.md emitted to stdout (engine captures → cycle dir). MUST-FIX.md written to `docs/cycle/0017-feature-bb-6-propagateblocked-engine-wide-halt-p/MUST-FIX.md` with 2 minor items: (1) `lastHaltContext` leaks stale halt metadata into `engine.stop` after fail→success, (2) SPEC-mandated cumulative resume+main-loop counter test missing. Implementation otherwise solid: 216/216 tests pass, coverage 96.27/88.44/94.69 above baseline, `propagateBlocked` 97/95/100, all 13 SPEC acceptance criteria met except the two flagged.
