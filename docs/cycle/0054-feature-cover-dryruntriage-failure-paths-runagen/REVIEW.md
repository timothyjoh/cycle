Verify done. 381/381 pass. Coverage `triage.ts` 99.72% (≥95% floor). No fs mutations escape. Implementation small, focused, matches SPEC + PLAN. One minor stylistic note: the intent comment is 3 lines (PLAN-driven) versus SPEC's "one-line" wording — not a blocker.

No MUST-FIX needed. Emit REVIEW.md to stdout:

# Review: Cycle 0054

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Tight, surgical implementation. Two new tests at the `dryRunTriage` entry point lock the previously runTriage-only-covered failure paths (Case A `runAgent` throws; Case B prompt template absent). A single localized `try/catch` wrap in `src/engine/triage.ts` re-throws the prompt-template read failure with a stable `prompt template missing: <resolved-path>: <cause>` prefix. CLAUDE.md row extended to document both observable shapes. Typecheck clean. 381/381 tests pass. Coverage gate `src/engine/triage.ts ≥ 95%` holds at 99.72%; aggregate floors (line 99.06%, branch 92.86%, func 96.32%) all above master baselines.

### Findings
1. **Style (minor, non-blocking)**: Intent comment is three lines rather than the "one-line comment" SPEC requirement — `src/engine/triage.ts:263-265`. The PLAN explicitly chose the three-line shape (PLAN.md Task 1), and the prose accurately captures the dry-run contract, so the intent is preserved. Flagging only for SPEC literal-wording drift.
2. **Error breadth (minor, non-blocking)**: The Case B wrap catches every `readFile` rejection (EACCES, EIO, EBUSY, etc.), not just ENOENT, and labels them all `prompt template missing` — `src/engine/triage.ts:268-274`. Tolerable: the resolved path is preserved in the message and the inner `e.message` is appended, so a permission error surfaces as `prompt template missing: <path>: EACCES: permission denied`, which is still legible. Narrowing to ENOENT would be a future refinement, not a present defect.

### Spec Compliance Checklist
- [x] Case A test exists, enters through `dryRunTriage`, pins `status: "failed"`, `attempts: 3`, `last_error` matches `/^agent failed: /` and includes `boom: claude spawn failed` (`tests/engine/triage-dry-run.test.ts:464-521`).
- [x] Case A asserts exactly `MAX_ATTEMPTS` (3) `runAgent` invocations (`tests/engine/triage-dry-run.test.ts:495`).
- [x] Case A asserts no filesystem mutations under `docs/cycle/issues/{raw,todo,done,failed}/` and no `.cycle/tbd.jsonl` / `.cycle/log.jsonl` creation (`tests/engine/triage-dry-run.test.ts:505-520`).
- [x] Case B test exists, uses `assert.rejects` predicate matching `/^prompt template missing: /` AND `e.message.includes(resolvedPromptPath)` (`tests/engine/triage-dry-run.test.ts:441-446`).
- [x] Case B asserts no filesystem mutations (`tests/engine/triage-dry-run.test.ts:448-462`).
- [x] `dryRunTriage` wraps prompt-template `readFile` in try/catch and re-throws `prompt template missing: <resolved-path>: <cause>` (`src/engine/triage.ts:266-274`).
- [x] Intent comment placed adjacent to the wrap stating the Case B shape is intentional (`src/engine/triage.ts:263-265`).
- [x] CLAUDE.md `cycle triage --dry-run` row extended with both observable shapes (`CLAUDE.md:28`).
- [x] Existing dry-run tests untouched and still passing.
- [x] No `runTriage` shape or behavior change, no new exported error class, no CLI wiring change.
- [x] No README.md edits (correctly skipped per SPEC).
- [x] `npm run typecheck` clean.
- [x] `npm test` clean (381/381 pass).
- [x] `npm run test:coverage` clean — per-file floor holds (99.72%), aggregate baselines hold.

## Adversarial Test Review

### Summary
Strong. Both new tests use dependency injection (the existing `TriageDeps` seam), not module mocks. Assertions are specific (`status === "failed"`, regex + substring on `last_error`, exact call count, byte-identity directory hashes). Case B uses a sentinel `runAgent` stub that would loudly fail if a regression bypassed the template check before reaching the agent. Filesystem-invariance suite mirrors the canonical pattern at `triage-dry-run.test.ts:232-303`.

### Findings
1. **Sentinel guardrail strength (positive)**: Case B's `runAgent` stub throws a guardrail error rather than returning a benign result — a regression that reordered the prompt read after `runAgent` invocation would crash with `"runAgent must not be called when prompt template is missing"` rather than spuriously passing (`tests/engine/triage-dry-run.test.ts:435-439`). Good adversarial posture.
2. **`null === null` invariance comparison (positive)**: `assert.equal(after.tbd, before.tbd)` and `after.log === before.log` rely on `fileBytes()` returning `null` on ENOENT (`tests/engine/triage-dry-run.test.ts:114-121`). If either file appeared mid-test, the side becomes a `Buffer` and the assertion fires. Correct shape for the dry-run no-mutation contract; flagged by SPEC §Risk Assessment and the implementation honors it.
3. **Case A `attempts: 0` clone exercised (positive)**: Case A confirms the dry-run runs the full 3-attempt budget regardless of on-disk `triage_attempts` (the `{ ...raw, attempts: 0 }` clone at `triage.ts:281-282`). `calls === 3` asserts this empirically.
4. **No mocking abuse**: Neither test mocks `fs`, `readFile`, or any module — only the `runAgent` seam is stubbed. Everything else is real `mkdtemp`, real `readFile`, real `mkdir`, real `rm`.
5. **Test independence**: Each test mints its own `mkdtemp` root and tears down in `finally`. Case B does not call `setupRepo()` (which would create the prompt file), so the inline scaffold is the only place this variant exists — intentional, documented in PLAN §Task 1.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function (aggregate): 99.06% / 92.86% / 96.32% — all above master baselines (95% / 75% / 90%).
- Per-file `src/engine/triage.ts`: line 99.72%, branch 97.80%, func 97.50%. Per-file floor (line ≥ 95%) holds. Uncovered lines: `triage.ts:610-611` (the default `runAgentViaDispatch` body that tests bypass via the `TriageDeps` seam) — pre-existing and out of scope.
- Regressions vs base (per-file): none.
- New code without tests: none. The new try/catch in `triage.ts:266-274` is exercised by Case B; the existing `runAgent`-throws catch at `triage.ts:113-119` was already covered through `runTriage` tests and is now additionally covered through `dryRunTriage` via Case A.
- Specific scenarios missing tests: none required by SPEC. Out-of-scope-but-noted: the wrap's behavior on non-ENOENT `readFile` failures (EACCES, EIO) is not pinned — finding #2 above — but SPEC does not require it.
