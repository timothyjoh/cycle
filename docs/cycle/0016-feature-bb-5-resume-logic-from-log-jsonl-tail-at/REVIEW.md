Now emit REVIEW.md to stdout for the engine to capture.

```markdown
# Review: Cycle 0016

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md. Implementation is correct and well-covered (199/199 tests, line 96.28% / branch 88.29% / func 95.19%, no regressions), but SPEC.md is empty and four negative-path/extraction items remain.

## Code Quality Review

### Summary
Implementation cleanly delivers PLAN.md tasks 1–6: `parseLogTail`/`readLogTail` (`src/engine/log-tail.ts`), idempotent `checkoutCycleBranch` (`src/engine/branch.ts:25`), `runCycle({ resume })` (`src/engine/run-cycle.ts:38-50,61-62`), hardened `markInProgress` (`src/engine/queue.ts:142-146`), CLI resume hook (`src/cli.ts:127-237`), and restart-tolerant `pr.sh` (`src/defaults/scripts/pr.sh:30-40`). Code follows existing patterns (line-by-line JSON parse with try/catch mirrors `cycle-id.ts`; `git` helper reuse; `mkdir recursive`). One critical process gap: SPEC.md is empty. One readability issue: the CLI resume block is 110 lines deep and duplicates drain logic with the pop loop.

### Findings
1. **Process / artifact**: SPEC.md is empty — `docs/cycle/0016-feature-bb-5-resume-logic-from-log-jsonl-tail-at/SPEC.md:1` is 2 blank lines. PLAN.md and BUILD.md are complete; SPEC alone is missing. Likely the spec step's claudecode call returned empty stdout and the engine wrote it anyway. Trace audit has nothing to anchor against.
2. **Maintainability**: CLI resume block nests 5 levels (`!args.dryRun && cfg` → `tail` → `else if (baseOk)` → bare block → `wfDef` → status branches) and duplicates success/retry/terminal drain with the pop loop — `src/cli.ts:127-237` vs `src/cli.ts:294-313`. Extracting `runResumeOnce` (and `drainSuccess` / `drainRetry`) would cut ~30 lines and remove duplication.
3. **Minor**: `src/cli.ts:148` row-cycle-id check (`row.cycle_id !== undefined && row.cycle_id !== tail.cycleId`) means a row in `in_progress` with no `cycle_id` set is treated as a match. In practice `markInProgress` always stamps `cycle_id`, so this is fine — flag for awareness.
4. **Minor**: `src/defaults/scripts/pr.sh:32` swallows real `gh pr list` failures via `2>/dev/null || true`, treating a network/auth error as "no existing PR" → calls `gh pr create` which then surfaces a different error message. Acceptable graceful degradation but obscures root cause. No fix recommended unless ops complaints surface.
5. **Architecture**: `runCycle` resume path runs the same `finally` (`checkoutBase` + `pullBase`) as fresh start — confirmed by `tests/engine/run-cycle.test.ts:498` (cycle.end before checkout for resume cycles). Consistent.

### Spec Compliance Checklist
SPEC.md is empty; checked against RFC-001 §§ 10–12 and BB-5 issue title instead.
- [x] Detect in-flight cycle via log.jsonl tail walk-back (`src/engine/log-tail.ts:30-45`)
- [x] Pre-resume `git fetch` + ff merge of base branch (`src/cli.ts:132-141`)
- [x] Preserve cycle branch + earlier artifacts (`src/engine/branch.ts:25-31` keeps branch, `mkdir { recursive: true }` preserves artifact files; `tests/engine/branch.test.ts:164-184` proves SPEC.md survives)
- [x] Re-run from first incomplete step (`src/engine/run-cycle.ts:61-62` uses `startStepIndex`)
- [x] `commit.sh` already idempotent (no change needed)
- [x] `pr.sh` detects existing PR by branch and skips create (`src/defaults/scripts/pr.sh:32-40`)
- [x] Fall through into normal triage → pop loop after resume completes (`src/cli.ts:254-314` runs unconditionally after resume hook)
- [x] New events `engine.resume` (`src/cli.ts:188-193`) and `cycle.resume` (`src/engine/run-cycle.ts:39-45`)
- [x] Subsumes the "pull origin/master between cycles" issue (already implemented in cycle 0011's `pullBase`; resume reuses it)
- [x] CLAUDE.md updated with resume architecture (`CLAUDE.md` engine quick-reference paragraph)
- [x] `npm run sync-defaults` mirrors `pr.sh` change (`.cycle/scripts/pr.sh` matches `src/defaults/scripts/pr.sh`)
- [ ] SPEC.md exists and documents the requirements — **NOT met** (file is empty)
- [x] `--dry-run` skips resume (`src/cli.ts:127` guarded by `!args.dryRun && cfg`)

## Adversarial Test Review

### Summary
Adequate. 12 unit tests for `parseLogTail`, 3 for `checkoutCycleBranch`, 3 resume-mode tests for `runCycle`, 3 idempotency tests for `markInProgress`, 5 CLI integration tests, 4 `pr.sh` tests (3 static-source + 1 behavioral). Mock discipline is strong — no internal mocking; only `claude` and `gh` are stubbed binaries on PATH. Negative-path coverage is the weak spot: the resumed-cycle-fails path is uncovered, `resume_workflow_missing` is uncovered, and the row-mismatch test only exercises 1 of 3 mismatch sub-cases. The headline feature (actual mid-cycle crash + recovery) is tested by *seeding* the in-flight state rather than crashing a real run; BUILD.md flagged this as a deliberate deviation for determinism — acceptable, but it leaves the SIGKILL → resume contract unverified.

### Findings
1. **Coverage gap — resumed cycle failure**: `src/cli.ts:220-232` (resume → cycle fails → `drainFailedRetry` or `terminalDrain`) is reachable but not exercised. All 5 integration tests assert success paths or warning emissions; none drive the resumed cycle to a step failure.
2. **Coverage gap — `resume_workflow_missing`**: `src/cli.ts:172-176`. PLAN.md flagged this branch as the most likely to escape coverage. Confirmed: no test seeds an in-flight workflow name absent from `workflows.yml`.
3. **Coverage gap — row mismatch sub-cases**: `tests/cli/resume.test.ts:200` only covers `!row` (missing). The `row.status !== "in_progress"` and `row.cycle_id !== tail.cycleId` branches at `src/cli.ts:146-148` are not separately tested.
4. **Test seam — synthetic resume state**: All 5 integration tests construct `log.jsonl` + branch + queue directly (`seedLogInFlight` at `tests/cli/resume.test.ts:101`) instead of running a real cycle, killing it mid-flight, and re-running. Determinism gain is real (no SIGKILL flakiness) but the real-world entry condition (process killed between `step.end` and `cycle.end`) is not exercised. Defensible deviation, but worth flagging.
5. **Assertion quality — strong**: integration tests check specific event sequences (`engine.resume.cycle_id`, `from_step`, `completed_steps`), artifact preservation (SPEC.md byte content unchanged at `tests/cli/resume.test.ts:188-189`), and call counters (claude invocation counter at `tests/engine/run-cycle.test.ts:500-502`). No `toBeTruthy`-style weak assertions found.
6. **Mock discipline — strong**: Fake `gh` in `tests/defaults/pr-restart-tolerance.test.ts:48-82` logs all invocations and matches on `$1 $2`, enabling the test to assert `pr create` was *not* called (`tests/defaults/pr-restart-tolerance.test.ts:113-114`). No internal-module mocking anywhere.
7. **Edge case — present**: `parseLogTail` covers empty input, no `cycle.start`, malformed lines, multi-cycle, ignored events, different `cycle_id`, failed-step exclusion. Missing: what if a `step.end` appears before any `cycle.start`? Defensive only — unlikely to ever occur.
8. **Test independence — good**: every test uses `mkdtemp` + `finally` cleanup; no shared state.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **96.28% / 88.29% / 95.19%** (baseline 95 / 75 / 90 — all exceeded)
- Regressions vs base (per-file): none. New files `log-tail.ts` 97.53 / 82.35 / 100; `run-cycle.ts` 98.13 / 83.87 / 83.33; `branch.ts` 100 / 94.74 / 92.31; `queue.ts` 96.05 / 86.75 / 100.
- New code without tests: none in source files; all new branches have at least one assertion path. Gaps are at *integration* level (CLI resume failure paths) not unit level.
- Specific scenarios missing tests:
  1. Resume → cycle fails non-terminally (retry drain)
  2. Resume → cycle fails on final attempt (terminal drain)
  3. `resume_workflow_missing` warning
  4. Row mismatch sub-cases: `status: pending` and different `cycle_id`
  5. Actual mid-cycle SIGKILL + recovery (synthetic-seed is the substitute; real-crash scenario deferred per BUILD.md)
```

Review complete. 1 critical (empty SPEC.md), 4 minor items in MUST-FIX.md — covering resume-failure drain paths, `resume_workflow_missing`, row-mismatch sub-cases, and resume-hook extraction. Coverage 96.28/88.29/95.19%, all 199 tests pass.
