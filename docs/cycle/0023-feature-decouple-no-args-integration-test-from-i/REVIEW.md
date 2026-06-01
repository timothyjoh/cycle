# Review: Cycle 0023

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A single, surgical, test-only edit that does exactly what SPEC.md mandates: it decouples the no-args integration test from the internal `'"event":"engine.start"'` JSONL substring, replacing it with routing- and encoding-independent assertions (clean exit + absence of argument-parse error). The retained exit-code guard preserves crash detection, the change matches PLAN.md verbatim, and all gates are green.

### Findings
1. **SPEC adherence**: Forbidden literal fully removed — `grep -c '"event":"engine.start"' tests/cli/help.test.ts` → `0`. The anchoring comment was deliberately reworded to reference "the engine.start JSONL event" without reproducing the exact byte sequence; this is the single sanctioned deviation from PLAN.md's literal comment text and is the correct SPEC-over-PLAN call — `tests/cli/help.test.ts:100`.
2. **Sentinel backing verified**: `"unknown command"` is a real thrown string at `src/cli/parse-args.ts:40`; `"Unknown argument"` / `ERR_PARSE_ARGS_UNKNOWN_OPTION` are the `nodeParseArgs` family invoked at `src/cli/parse-args.ts:42`. The combined-stream check is strictly stronger than the removed `unknown command`-only stderr check — no regression detection lost — `tests/cli/help.test.ts:107`.
3. **Failure handling**: No swallowed errors. The only `try/finally` wraps idempotent temp-dir cleanup (`rm(..., { force: true })`) and does not suppress assertion throws — `tests/cli/help.test.ts:113`. Exit-code assertion (`null`/non-zero ≠ `0`) catches crash, triage-pause exit 1, and 30s timeout; both assertions embed captured stdout/stderr in diagnostics (observable, fail-safe) — `tests/cli/help.test.ts:104`.
4. **Idempotency**: Fresh `mkdtemp` per run isolates engine PID-lockfile/queue state across re-runs; the engine's retry/restart of this step cannot leak state — `tests/cli/help.test.ts:92`.
5. **Architecture / patterns**: Follows existing file idioms — `PARSE_ERROR_SENTINELS` mirrors the `USAGE_SENTINEL` named-constant pattern (`tests/cli/help.test.ts:8,11`); negative-assertion + diagnostic-message style matches the surrounding tests. No `src/` production code touched.

### Spec Compliance Checklist
- [x] `tests/cli/help.test.ts` no longer contains `'"event":"engine.start"'` (grep → 0)
- [x] No-args test asserts `r.status === 0` (retained verbatim)
- [x] Asserts stdout/stderr does not contain an argument-parse error string (combined-stream sentinel loop)
- [x] Anchoring comment explains stable-contract rationale and why the JSONL match was removed
- [x] Failure-path: exit-code check retained, not removed — a non-zero/timeout `r.status` fails the test
- [x] `npm test` passes in full (881/881)
- [x] `npm run test:coverage` — `src/cli.ts` has no per-file floor; all per-file floors pass; no regression introduced (identical code path executed)
- [x] All existing tests still pass
- [x] No compiler warnings (`npm run typecheck` clean)
- [x] Test title no longer claims "emits engine.start"
- [x] SPEC has a `## Acceptance Criteria` section with testable bullets
- [x] PLAN.md `## SPEC Acceptance Traceability` re-quotes every AC bullet verbatim and pairs each with a covering task

## Adversarial Test Review

### Summary
Strong. The test spawns the real built `dist/cycle.js` against a real temp git repo — anti-mock, true integration coverage. Assertions are specific and carry self-diagnosing failure messages.

### Findings
1. **Mock abuse**: None. Zero mocking; the test exercises the full binary via `spawnSync` — `tests/cli/help.test.ts:93`.
2. **Assertion quality**: Specific, not weak. Exit code pinned to `0` with `status` + stderr in the message; each sentinel checked individually with the matched sentinel named in the diagnostic — `tests/cli/help.test.ts:104,108`.
3. **Failure paths**: Crash / non-zero / 30s-timeout (`status === null`) caught by the exit-code assertion; parse regressions caught regardless of which stream they land on. Per SPEC, no separate broken-fixture test was added — the failure-path acceptance is satisfied by the retained exit-code guard, verified by reasoning. Acceptable, not a gap.
4. **Test independence**: No shared state or ordering dependency — fresh `mkdtemp` per run, `finally` cleanup — `tests/cli/help.test.ts:92,113`.
5. **Acknowledged residual (not a defect)**: The new assertions verify clean parse + clean exit but no longer prove the engine actually reached `engine.start`. SPEC explicitly chose this decouple trade-off (Out of Scope: promoting `engine.start`-on-stdout to a documented contract), so the weaker positive guarantee is by design.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (all files): 40.30% / 87.23% / 45.60% — Branch 87.23% ≥ 75% baseline. (All-files line/function totals reflect always-present unexercised tool modules, not this cycle; enforcement is via `scripts/coverage-gate.mjs`, which passed.)
- Per-file floors: all pass (`src/cli.ts` has no per-file floor; `src/engine/run-cycle.ts` 100%, `triage.ts` 99.75%, etc.)
- Regressions vs base (per-file): none — change is test-only and does not alter which code paths the spawned binary executes
- New code without tests: none — the change *is* test code
- Specific scenarios missing tests: none beyond the SPEC-sanctioned omission of a standalone broken-`cycle` fixture

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.
