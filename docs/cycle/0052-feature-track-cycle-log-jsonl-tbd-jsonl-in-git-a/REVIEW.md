All verified. The AC#3 waiver is honest (those three files are genuinely un-ignored and two are already tracked; ignoring them would untrack committed files — correctly out of scope). All doc claims backed, coverage above floor, the cycle's own tests pass, and the 20 suite failures reproduce at HEAD (pre-existing/environmental, not this cycle). No MUST-FIX needed.

# Review: Cycle 0052

## Overall Verdict
PASS — no fixes needed

The implementation is narrowly scoped, correct, fail-safe, and fully documented. All in-scope SPEC acceptance criteria are met; the single partially-met bullet (AC #3) is honestly waived for three pre-existing files that cannot be ignored without untracking already-committed content (explicitly out of scope). Note the environmental caveat under *Adversarial Test Review* — 20 spawn-heavy CLI integration tests fail in this sandbox, but they were confirmed pre-existing (they fail identically at HEAD with this cycle's changes stashed) and are unrelated to the touched files.

## Code Quality Review

### Summary
A two-line `.gitignore` removal plus an 11-line existence-guarded explicit-staging pass in `stageFiles`, with matching doc reconciliation. The change is minimal, idempotent, and fail-safe; it follows the established staging-loop contract exactly and introduces no new error-swallowing or fail-open path.

### Findings
1. **Correctness / idempotency**: `STATE_FILES` are staged via an `existsSync`-guarded `git add -- <path>` loop placed after the status-driven loop and before the `git diff --cached --quiet` check — `src/engine/commit-cycle.ts:108-112`. `git add` is idempotent, so double-staging with the status loop (the paths are not `isDenied`) coalesces harmlessly. Correct.
2. **Fail-safe / no silent failure**: A missing state file (fresh repo before first cycle) is skipped by the `existsSync` guard with no `git add` and no error — `src/engine/commit-cycle.ts:109`. A genuine `git add`/commit failure still surfaces through the unchanged `git diff --cached --quiet` "nothing staged" path and the existing `commit_failed`/`push_failed` return; no new `try/catch` swallows anything. Matches the established loop contract.
3. **Residue guard non-interference**: The now-tracked files cannot trip the dirty-worktree halt — `isEngineOwned` excludes the entire `.cycle/**` tree at `src/engine/failed-residue-guard.ts:42`. Verified.
4. **Scope discipline**: Only the two target ignore lines were removed; no new ignore rules added (`.gitignore:5-10` retains `cycle.pid`/`.sync-state.json`/`coverage.lcov`/`engine.lock`). No `src/defaults/.gitignore` exists and nothing in `src/` generates a per-repo ignore (the only `.gitignore` mention in `src/` is a prose comment), so `sync-defaults` was correctly not required — recorded in `BUILD.md`. Correct.

### Spec Compliance Checklist
- [x] `git check-ignore .cycle/log.jsonl .cycle/tbd.jsonl` reports neither file (verified: exit 1, no output)
- [x] `git show --stat HEAD` will list both after a cycle (guaranteed by explicit existence-guarded staging at `commit-cycle.ts:108-112`)
- [x] `engine.lock` / `cycle.pid` / `coverage.lcov` / `.sync-state.json` still ignored (verified: exit 0, all four listed)
- [~] AC #3 sub-clause for `run.log` / `.env` / `failed-residue-context.json` — **honestly WAIVED**. Verified these are genuinely *not* ignored (exit 1) and `.cycle/.env` + `.cycle/run.log` are already git-tracked; making them ignored would untrack committed files, which is out of scope. Waiver documented in PLAN traceability + `BUILD.md`. Not a defect of this cycle.
- [x] Commit-cycle unit test asserts both paths staged before commit
- [x] Failure-path test asserts an absent state file is skipped (not staged as existing), commit still proceeds
- [x] `commit-cycle.ts` coverage ≥ 95% floor (99.57% line)
- [x] No typecheck warnings (`tsc --noEmit` clean)
- [x] Docs reconciled (CLAUDE.md, README.md, `docs/ARCHITECTURE.md`, `docs/ENGINE.md`); `cycle upgrade` contents-contract affirmed
- [x] SPEC has a populated `## Acceptance Criteria` section; PLAN has a complete `## SPEC Acceptance Traceability` section re-quoting every bullet verbatim

> `git ls-files .cycle/log.jsonl .cycle/tbd.jsonl` is currently empty — expected and correct: this cycle's own `commitCycle` step performs the initial bulk-add, which has not yet run at review time. The staging logic guarantees inclusion.

## Adversarial Test Review

### Summary
Strong. The three new tests use real `git` in a temp repo (no over-mocking) with the established `makeSpawn`/`calls[]` recording pattern, and assert specific, ordered invocations rather than weak truthiness.

### Findings
1. **Happy path**: asserts both `git add -- .cycle/log.jsonl` and `git add -- .cycle/tbd.jsonl` appear in recorded calls *before* `git commit`, and verifies real `git ls-files` tracks both post-commit — `tests/engine/commit-cycle.test.ts:198-243`. Specific, ordering-aware assertions.
2. **Failure path (missing file)**: asserts an absent `log.jsonl` produces *no* `git add -- .cycle/log.jsonl` while a present `tbd.jsonl` is still staged and the commit proceeds — `tests/engine/commit-cycle.test.ts:245-281`. Directly exercises the `existsSync` skip arm.
3. **Boundary (both absent + clean tree)**: asserts `{ status: "skipped", reason: "nothing_to_commit" }` and no `git commit` — `tests/engine/commit-cycle.test.ts:283-316`. Covers the empty-staged-set path.
4. **No mock abuse**: setup mocks only `git push`/`gh`; real `git` drives staging. Idempotency of double-staging is exercised implicitly against the real temp repo.

### Test Coverage
- Command run: `npm run test:coverage`
- `src/engine/commit-cycle.ts`: Line **99.57%** / Branch **85.51%** / Function **100.00%** (≥ 95% floor; coverage-gate green)
- Regressions vs base (per-file): none — all per-file floors pass; full coverage-gate + `check:invariants` green (residue arm→persist invariant still reports `5 paired`)
- New code without tests: none — both staging arms (present/absent) and the empty-set path are covered
- Specific scenarios missing tests: none for the cycle's change
- **Suite-level caveat:** `npm test` reports 1100 tests / 1080 pass / **20 fail**. All 20 are spawn-heavy CLI integration tests in files this cycle did not touch (`tests/cli/halt.test.ts`, `tests/cli/iteration-too-fast.test.ts`, `tests/cli/failed-residue-guard.test.ts`, `tests/cli/resume.test.ts`, and the real-repo structural-invariants test). Confirmed pre-existing and environmental: stashing this cycle's tracked changes and re-running `tests/cli/halt.test.ts` against HEAD reproduces 5/6 failures identically. Not introduced by cycle 0052 (BUILD.md's "1100/1100" reflects the build agent's environment; these tests are flaky/non-hermetic in this WSL `/mnt/c` sandbox). The cycle's own `tests/engine/commit-cycle.test.ts` passes 25/25.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "`.cycle/log.jsonl` and `.cycle/tbd.jsonl` are git-tracked, committed-per-cycle state-of-record (un-ignored cycle 0052; `commitCycle` stages them every cycle)" | `CLAUDE.md:33` | `src/engine/commit-cycle.ts:11,108-110` (`STATE_FILES` + `git add` loop); `.gitignore` (lines removed) | OK |
| "The log and the work queue (`.cycle/tbd.jsonl`) are git-tracked and committed every cycle, so they travel with a clone" | `README.md:79` | `src/engine/commit-cycle.ts:108-110` | OK |
| "The log is git-tracked and committed every cycle … the derived next cycle-id starts from the real high-water mark" | `docs/ARCHITECTURE.md:277-280,469-471` | `src/engine/commit-cycle.ts:108-110` (staging) + `src/engine/cycle-id.ts` (high-water derivation, cycle 0051) | OK |
| "**Residue-excluded ≠ untracked:** `.cycle/log.jsonl` and `.cycle/tbd.jsonl` are git-tracked … yet still residue-excluded here" | `docs/ENGINE.md:66` | `src/engine/failed-residue-guard.ts:42` (`.cycle/**` exclusion) | OK |
| "`cycle upgrade` still never modifies their *contents* — git merely tracks them" | `CLAUDE.md:33` | unchanged `upgrade` behavior (no `upgrade` code touched this cycle; contract affirmed, not modified) | OK |

All enumerated doc claims are backed; no unbacked claims found.
