All verification complete. Producing the review artifact.

# Review: Cycle 0042

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A precise, minimal, well-scoped cycle: a single production line (`await persistResidue(pendingResidueContext);`) added at the within-budget `drainRetry` arm in `src/cli.ts:874`, mechanically symmetric with the four already-persisted terminal-failure branches (`:671`/`:802`/`:859`/`:887`). It closes the last crash-safety hole in the residue guard. Four new regression tests, doc updates in both CLAUDE.md and `docs/ENGINE.md`, full suite green, typecheck clean, all coverage floors hold.

### Findings
1. **Correctness**: The persist call is placed immediately after the in-memory `pendingResidueContext` set, so on-disk and in-memory state stay lock-step — `src/cli.ts:873-874`. Matches the established pattern exactly.
2. **Fail-safe**: `persistResidue` is best-effort — a write failure is caught and downgraded to `engine.warning { reason: "residue_context_write_failed" }` without throwing, so the retry's own failure routing (`drainRetry` already ran) is never masked — `src/cli.ts:250-260`. Correct fail-safe degrade to the in-memory guard.
3. **Idempotency**: The store uses atomic tmp+rename; re-arming overwrites with identical content; the existing clean-tree/success/noop clears call `unpersistResidue()` (ENOENT-swallowing). Re-running is safe. No new delete site was needed, per SPEC Out-of-Scope — confirmed by the structural invariant still reporting `3` gated check sites.
4. **Observability**: Success is silent (matching the four existing branches); the write-failure path surfaces a structured warning with `cycle_id`/`issue_id`/`error`. No silent failure.
5. **Scope hygiene (non-blocking, not a 0042 defect)**: The working tree also carries uncommitted cycle 0041 residue (`tests/engine/noop-resolution.test.ts`, `docs/cycle/0041-*/`, and issue-lifecycle moves) that is outside cycle 0042's `touched.json` and BUILD.md. It is not introduced by this cycle's diff and does not affect this verdict; flagged only so it is committed/cleared before the next engine run.

### Spec Compliance Checklist
- [x] Crash after within-budget retry armed → fresh start reads `.cycle/failed-residue-context.json`, detects residue, halts (Task 3 cross-process test)
- [x] Context file written with correct `cycleId`/`issueId`/`failingStep` after within-budget arm (Task 2 test)
- [x] Fresh start emits exactly one `engine.halted` + terminal `engine.stop { reason: "failed_cycle_dirty_worktree" }`, cardinality-pinned (Task 3)
- [x] Write-failure emits one `residue_context_write_failed`, does not throw, in-memory guard still halts (Task 4)
- [x] Persisted file deleted on next clean-tree/success/noop clear after a within-budget retry (Task 5)
- [x] CLAUDE.md / `docs/ENGINE.md` no longer call the retry arm an un-persisted limitation
- [x] Coverage not decreased; all per-file LCOV floors pass
- [x] All existing tests pass (1072 pass / 0 fail)
- [x] No compiler/linter warnings (`npm run typecheck` clean)
- [x] SPEC has a non-empty `## Acceptance Criteria` section (9 testable bullets)
- [x] PLAN has `## SPEC Acceptance Traceability` re-quoting all 9 AC bullets verbatim, each paired to a covering task
- [x] CONCRETE USER BENEFIT deliverable end-to-end: crash mid-retry → restart → crash-safe halt is realizable, proven by the cross-process test driving the built `dist/cycle.js`

## Adversarial Test Review

### Summary
Strong. All four new tests are full end-to-end engine runs against the built CLI parsing real `.cycle/log.jsonl` — no mocks. Assertions are specific (exact field values, exact event cardinality), and each test pins a distinct branch.

### Findings
1. **Regression value**: `within-budget retry arm persists context to disk` fails without the Task 1 line (file would only be in-memory) and passes with it — a genuine guard, not a tautology — `tests/cli/failed-residue-guard.test.ts:582`.
2. **Cardinality discipline**: failure/halt events use `filter(...).length === 1` per the CLAUDE.md exactly-once convention, not bare `find` — `:631`, `:643`, `:691`, `:700`.
3. **Real-fs failure injection**: the write-failure test pre-creates the target path as a non-empty directory so the atomic rename throws, per the documented `node:fs/promises` non-stubbable constraint — `:649-659`. The `residue_context_write_failed` count is pinned to exactly 1, isolating the new branch.
4. **Clear-path correctness**: Task 5 uses an engine-owned `.cycle/`-counter verify script (never trips the guard) to drive fail-then-succeed, asserting `contextExists() === false` and exactly one `queue.drained {outcome:"ok"}` — the BUILD.md-noted refinement (two drains occur: one retry, one success) is handled correctly by filtering on `outcome:"ok"` — `:732`.
5. **Negative assertions present**: tests assert absence where it matters (`cycle.start` count `0` after a halt; no `failed_cycle_dirty_worktree` on the clean-tree path), covering the "no new cycle stacked" invariant.

### Test Coverage
- Command run: `npm run test:coverage` (runs `check:coverage` + `check:invariants`)
- Line / branch / function: global "all files" table reads 44.34% / 88.38% / 48.69% — this counts non-instrumented fixtures and is not the enforced policy; the enforced per-file LCOV floor gate is fully green (e.g. `residue-context-store.ts` 100%, `run-cycle.ts` 100%, `failed-residue-guard.ts` 100%, `preflight.ts` 99.22%)
- Regressions vs base (per-file): none — every `coverage-gate` line reports `ok`
- New code without tests: none — the persist line is exercised by Task 2 (success path) and Task 4 (catch branch)
- Specific scenarios missing tests: none material. `src/cli.ts` is not floor-gated (no per-file floor entry), but the added line and its failure branch are both directly exercised.

## Doc-vs-Code Claim Verification

| Claim | Source (doc:line) | Backing (code:line) | Status |
|---|---|---|---|
| "persisted at the four terminal-failure branches **and the within-budget retry arm** (five persist sites, cycle 0042)" | `CLAUDE.md:128` | `src/cli.ts:671,802,859,874,887` (five `await persistResidue` calls) | OK |
| "With the retry arm now persisted (cycle 0042), the guard is crash-safe across **every** loop-back path — there is no longer an un-persisted in-process-only gate" | `CLAUDE.md:128` | `src/cli.ts:873-874` (persist adjacent to in-memory set in the `else if (row.attempt + 1 < maxAttempts)` arm) | OK |
| "write/delete failures emit `engine.warning {reason: "residue_context_write_failed" \| "residue_context_delete_failed"}`" | `CLAUDE.md:128` | `src/cli.ts:255` (write), `src/cli.ts:268` (delete) | OK |
| "**persists** at the four terminal-failure branches … **and the within-budget retry arm** (five persist sites, cycle 0042)" | `docs/ENGINE.md:70` | `src/cli.ts:671,802,859,874,887` | OK |
| "the within-budget retry arm now calls `persistResidue` adjacent to its in-memory set (the fifth persist site)" | `docs/ENGINE.md:76` | `src/cli.ts:874` | OK |
| "a process that crashes after a within-budget retry was queued but before it re-ran still re-checks the persisted context on the next start" | `docs/ENGINE.md:76` | `src/cli.ts:874` (persist) + `src/cli.ts:240` `residueContextPath` read at startup re-check | OK |
| "three gated paths"/"three check sites" retained alongside five persist sites (check vs persist distinction) | `docs/ENGINE.md:68`, `CLAUDE.md:128` | structural-invariant "wired at exactly three gated sites" = `3` (confirmed in gate output) | OK |

All in-scope doc prose changes are backed by a concrete `file:line` reference at HEAD; no unbacked claims.
