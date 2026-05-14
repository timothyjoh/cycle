Verification: 392/392 pass; coverage line 98.98% / branch 92.78% / func 96.36%; `src/engine/triage.ts` 99.45% / 97.27% / 97.50%; typecheck clean. Per-file floor (`src/engine/triage.ts ≥ 95%`) holds via `coverage-gate: ok — src/engine/triage.ts 99.45% ≥ 95%`. Reviewing implementation against SPEC/PLAN.

★ Insight ─────────────────────────────────────
- The `failedRaws: RawIssue[]` deferred-list pattern keeps the all-fail vs partial-fail decision a single post-loop branch, which is much easier to reason about than threading the decision into each per-raw iteration. The price is that `lines 676-677` (the `moveToFailed.rename` swallow) become harder to exercise from tests, because the rename now only fires on the partial-fail flush.
- `rewriteOrdering` is invoked before the deferred flush, but it only consumes queue rows that `applyRaw` wrote (i.e., success cases), so the ordering is decoupled from when `failed/` renames happen. This is the invariant that makes the deferral safe.
- Subtle implication of `triage_attempts: 3` staying on the raw with no `failed_at` stamp: a real engine re-fire after `engine.paused` will immediately re-pause without invoking the agent (the `for (let attempt = raw.attempts; attempt < MAX_ATTEMPTS; …)` loop skips), which is now documented in README as "also reset `triage_attempts` in the frontmatter."
─────────────────────────────────────────────────

```markdown
# Review: Cycle 0059

## Overall Verdict
PASS — no fixes needed.

Implementation matches PLAN.md byte-for-byte. Engine diff is +10/-2 in `src/engine/triage.ts`. All test gates green (392/392), coverage gates green (line 98.98% / branch 92.78% / func 96.36%; per-file `src/engine/triage.ts` 99.45% line / 97.27% branch / 97.50% func ≥ 95% floor). Docs updated across all three target files. No deviations from the issue's acceptance criteria.

## Code Quality Review

### Summary
Minimal, surgical engine change. The deferred-list pattern is the right shape — single post-loop branch on `failed.length === raws.length` gates flush vs skip. Comments are non-obvious WHY (per CLAUDE.md guidance). Index-alignment between `failed[]` / `lastErrors[]` / `failedRaws[]` is preserved even though only `failed[]` and `lastErrors[]` are zipped at the `engine.paused` payload site — the alignment is structural, not exploited.

### Findings

1. **Engine contract — clean.** `src/engine/triage.ts:185-256` — `failedRaws` deferred list, partial-fail flush after `rewriteOrdering`, all-fail short-circuit with byte-identical `engine.paused` payload. Matches PLAN Task 1 exactly.

2. **`engine.paused` payload preserved.** `src/engine/triage.ts:228-244` — schema unchanged, MAX_ERR_LEN truncation preserved, raw_ids/last_errors index-alignment preserved. Regression-guarded by existing `engine.paused last_errors truncates errors longer than 2000 chars` + `at boundary length 2000 is not truncated` tests.

3. **`rewriteOrdering` placement intentional.** `src/engine/triage.ts:224-226` — runs before the deferred flush. The decoupling is correct: `rewriteOrdering` only consumes queue rows that `applyRaw` (success path) wrote, so the post-flush ordering is independent of `failed/` renames. Verified by the regression test at `tests/engine/triage.test.ts:438-485` (still green, unchanged).

4. **Doc drift fixed in same cycle.** README §"Recovering from engine.paused" rewritten; RFC-001 §5 mentions both contracts; CLAUDE.md triage paragraph appends the all-fail-stays-in-raw clause. No stragglers — `grep -nE 'failed/[a-z-]+\.md' README.md` would show only partial-failure context.

### Spec Compliance Checklist
SPEC.md for cycle 0059 is degenerate (≈120 bytes; only restates the stdout/capture contract). Cycle works from the authoritative issue file `docs/cycle/issues/done/refl-0024-defer-movetofailed-until-after-all-triag_raw.md` instead. PLAN.md §Risk Assessment explicitly notes that the cycle-0058 SPEC.md byte-floor guard did not fire here and is out of scope. Against the issue acceptance criteria:

- [x] All-fail: raws stay in `raw/`; `failed/` untouched.
- [x] Partial-fail: failed subset still moves to `failed/<id>.md` with `failed_step: "triage"` + `failed_at` stamped.
- [x] `engine.paused` payload schema unchanged.
- [x] `dryRunTriage` after pause sees the same raws without operator `mv`.
- [x] `README.md`, `docs/RFC-001-issue-lifecycle.md`, `CLAUDE.md` updated.
- [x] Coverage gates green; per-file floor preserved.
- [x] No `engine.paused` schema, log event name, or workflow YAML changes.

## Adversarial Test Review

### Summary
Strong. Real tmp-directory harness, only `runAgent` mocked. Fault-injection tests use the existing `.tmp` directory trick rather than mocking `fs`/`rename`/`mutateFrontmatter`. Tests assert observable filesystem state (`raw/`, `failed/` listings + frontmatter) plus emitted events.

### Findings

1. **`stampfail` repointing is the right call.** `tests/engine/triage.faults.test.ts:181-264` — restructured to two raws (one fails-every-attempt, one decomposes cleanly), forcing the partial-fail branch so the deferred-flush `moveToFailed` call still fires under the injected `mutateFrontmatter` fault. Stamp-pass swallow branch still exercised; verified by `engine.paused must not fire on partial-fail` assertion. Solid.

2. **`vanish` left as all-fail by design.** `tests/engine/triage.faults.test.ts:240-264` — now exercises the all-fail path with raw-already-unlinked. Test contract narrowed from "moveToFailed.rename catch swallowed" to "all-fail never calls moveToFailed, so no `failed/` artifact regardless." Plan explicitly allowed this ("otherwise leave `vanish` alone"). Trade-off acknowledged: `moveToFailed.rename` swallow at `src/engine/triage.ts:676-677` is now uncovered (was covered before). Per-file floor still 99.45% ≥ 95%, so the gate doesn't trip. **This is acceptable as documented in the plan but worth tracking.**

3. **New `all-fail: raws remain in raw/...` positive test is thorough.** `tests/engine/triage.test.ts:539-588` — two-raw all-fail, asserts `raw/` listing intact, `failed/` empty, `triage_attempts === 3` on both, no `failed_at` / `failed_step` stamps. Captures the new contract directly.

4. **`dry-run after all-fail pause` test exercises the full operator flow.** `tests/engine/triage-dry-run.test.ts:525-562` — runs `runTriage` to pause, asserts `raw/p.md` still present without manual `mv`, then runs `dryRunTriage` and asserts the report (`status: "failed"`, `attempts: 3`). End-to-end coverage of the acceptance criterion.

5. **Realigned `atomic apply rolls back when appendRow fails` and `persisted triage_attempts carries into next run` assertions.** `tests/engine/triage.test.ts:756-765` and `:900-907` — both now assert raw-retention on all-fail. Preserves the existing rollback / persistence regression guards under the new branch shape.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (aggregate): 98.98% / 92.78% / 96.36%
- Per-file `src/engine/triage.ts`: 99.45% / 97.27% / 97.50%
- Regressions vs base (per-file): none above the configured floor; `src/engine/triage.ts` slipped 99.72% → 99.45% but stays well above 95%. Uncovered lines: `616-617` (applyRaw rollback unlink swallow, pre-existing) and `676-677` (moveToFailed.rename swallow, newly uncovered — see Finding 2).
- New code without tests: none — every new branch (`failedRaws.push`, deferred flush loop) is exercised by `stampfail` (loop body, N=1), `tests/engine/triage.test.ts:438-485` (partial-fail with applyRaw), or the new all-fail retention test.
- Specific scenarios not directly tested:
  - Multi-failed partial-fail (N>1 entries in `failedRaws`). Loop body is identical to N=1, so risk is low — not a blocker, but a multi-fail partial-fail test would tighten the regression net.
  - `rewriteOrdering` throwing mid-pass with a non-empty `failedRaws`. Exceptional path; behavior change (failed raws don't move) is no worse than the old code's behavior in the same path. Out of scope.
  - `moveToFailed.rename` swallow itself (676-677) is no longer exercised. Reachable only on partial-fail with a raw unlinked between per-raw retry and the deferred flush — a narrow window. Defensive code retained; coverage acceptable per plan.
```

Review complete. Verdict: **PASS**. No MUST-FIX.md created — implementation matches plan byte-for-byte, all gates green, no critical or blocking issues. Minor observations (lost `moveToFailed.rename` swallow coverage at `src/engine/triage.ts:676-677`; no multi-failed partial-fail test) are documented in REVIEW but anticipated by PLAN §Risk Assessment / Task 4 and stay well above the configured per-file coverage floor.
