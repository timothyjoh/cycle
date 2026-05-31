# Review: Cycle 0014

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
A clean, tightly-scoped build-time guard: one declarative `INVARIANTS` entry pinning the inlined `consecutiveFailures += 1` mutation in `src/cli.ts` to its sole sanctioned occurrence (the resume block), making the cycle-0013 de-duplication self-enforcing. No production engine source touched; change is confined to the checker data table plus tests/fixtures, exactly as SPEC requires.

### Findings
1. **Correctness (verified)**: The new entry registers cleanly and `npm run check:invariants` exits 0 with an `ok` line for the new rule — `scripts/structural-invariants.mjs:37-44`.
2. **Non-vacuity (verified)**: `grep -c "consecutiveFailures += 1" src/cli.ts` returns exactly `1` (the resume block at `src/cli.ts:440`); the three delegating branches use `consecutiveFailures = acct.consecutiveFailures` (`src/cli.ts:535,588,608`), and the functional non-mutating form `prev.consecutiveFailures + 1` lives in `src/engine/halt-accounting.ts` (outside the `src/cli.ts` scan). The `+= 1` anchor matches the mutation without false-positives.
3. **Failure handling**: No new error paths introduced — the change is a literal data append iterated by the pre-existing checker loop. The mismatch path (`console.error` → `failed++` → `exit(1)`) and the unreadable-target path (`exit(2)`) are unchanged and surface violations to stderr; nothing is swallowed.
4. **Scope discipline**: Out-of-scope items (runtime bookkeeping, `recordTerminalFailure`, supervisor control flow, checker generalization, agent-fleet REGISTRY invariant) were correctly left untouched.
5. **Minor (non-blocking)**: The pattern `/consecutiveFailures \+= 1/g` would also match a hypothetical `consecutiveFailures += 10`/`+= 100`. Not a practical hazard for this codebase and within the SPEC-sanctioned single-regex posture; no action required.

### Spec Compliance Checklist
- [x] Exactly one new `INVARIANTS` entry, `file: 'src/cli.ts'`, `reason` names the single-implementation rule + resume-block exception — `scripts/structural-invariants.mjs:37-44`.
- [x] `npm run check:invariants` exits 0; stdout includes the new `ok` line.
- [x] Violation test: re-inlined fixture (count 2) → exit 1, stderr asserts `src/cli.ts`, reason substring, `expected 1`, `got 2` — `tests/scripts/structural-invariants.test.ts:53-68`.
- [x] Clean test: single-implementation fixture (count 1) → exit 0, empty stderr — `tests/scripts/structural-invariants.test.ts:70-83`.
- [x] Real-repo regression-pin test unchanged and passing (live count == 1, non-vacuous).
- [x] All existing tests pass; `npm run typecheck` clean (exit 0).
- [x] `## Acceptance Criteria` section present in SPEC.md with testable bullets.
- [x] SPEC→PLAN traceability section present, re-quotes every SPEC AC bullet verbatim with a covering task — `PLAN.md:170-181`.
- [x] No CLAUDE.md/README change required (existing structural-invariants policy already documents the table as single source of truth; SPEC marks the doc edit optional).

## Adversarial Test Review

### Summary
Strong. Real `spawnSync` of the actual checker against real temp filesystems — zero mocking, consistent with the established suite convention and the CLAUDE.md note that `node:fs/promises` cannot be `mock.method`-stubbed.

### Findings
1. **Assertion quality**: Specific and multi-faceted — the violation test asserts exit status *and* four independent stderr substrings (`src/cli.ts`, reason, `expected 1`, `got 2`), not a weak truthy check — `tests/scripts/structural-invariants.test.ts:60-65`.
2. **Both paths covered**: Failure (exit 1) and success (exit 0, empty stderr) are both exercised; the regression-pin guards against an over-tight zero-match pattern.
3. **Test independence**: Each test allocates a unique `mkdtemp` root and removes it in `finally` via `rm(..., { recursive: true, force: true })` — no shared state, order-independent, re-run safe.
4. **Harness deviation handled correctly**: The `setup` default `cliContent` was changed from `"// stub"` to `"// stub\nconsecutiveFailures += 1;\n"` (BUILD.md documents this) so the two pre-existing two-arg triage tests carry exactly one sanctioned occurrence and continue to pass under the new rule. Verified: the triage-violation and triage-clean tests still pass — `tests/scripts/structural-invariants.test.ts:11-15`.
5. **Boundary**: The violation fixture deliberately uses count 2 (expected + 1), the minimal violation — a precise boundary probe.

### Test Coverage
- Command run: `npm run test:coverage` (→ `coverage-gate.mjs` + `structural-invariants.mjs`)
- Line / branch / function: 39.09% / 86.86% / 44.90% (aggregate; dominated by untested vendored TUI surface, unchanged by this cycle)
- Regressions vs base (per-file): none — all 20 floored files pass; `scripts/structural-invariants.mjs` 95.45% ≥ 90%, `src/engine/halt-accounting.ts` 100% ≥ 100%
- New code without tests: none — the new INVARIANTS entry is exercised by the checker loop and the two new tests; no new uncovered branches
- Specific scenarios missing tests: none material. (Targeted run: 5/5 structural-invariants tests pass; full `npm run test:coverage` exits 0 with all gates green.)

## Doc-vs-Code Claim Verification

No documentation prose changed; pass skipped.

*(Diff touches only `scripts/`, `tests/`, `.cycle/`, and `docs/cycle/*` — the latter excluded from this pass scope. No `README.md`, `CLAUDE.md`, `AGENTS.md`, or in-scope `docs/**` prose modified.)*
