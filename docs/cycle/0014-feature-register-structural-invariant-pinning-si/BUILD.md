## Summary

This cycle registered a build-time structural invariant pinning the inlined terminal-failure bookkeeping mutation in `src/cli.ts` to its single sanctioned occurrence (the resume block), making the cycle-0013 de-duplication self-enforcing.

**Files modified/created:**
- `scripts/structural-invariants.mjs` (+7 lines) — appended the 5th `INVARIANTS` entry: `{ file: 'src/cli.ts', pattern: /consecutiveFailures \+= 1/g, expected: 1, reason: 'terminal-failure bookkeeping single-implementation…' }`. No checker control-flow, exit-code, or import change.
- `tests/scripts/structural-invariants.test.ts` (+30 lines) — widened `setup` with an optional third `cliContent` parameter, added a violation test (re-inlined mutation → exit 1) and a clean test (single-implementation layout → exit 0).
- `tests/fixtures/structural-invariants/cli-violation.ts` (new, 6 lines) — two `consecutiveFailures += 1` occurrences (count 2 > expected 1).
- `tests/fixtures/structural-invariants/cli-clean.ts` (new, 7 lines) — one sanctioned `consecutiveFailures += 1` occurrence plus the delegating assignment form.

**PLAN.md tasks complete:** Task 1 (register the INVARIANTS entry) and Task 2 (extend `setup`, add violation/clean tests, add fixtures). The unchanged real-repo regression-pin test now also exercises the new rule against the live `src/cli.ts` (count 1, non-vacuous).

**Test command and result:** `npm test` → 826 tests, 826 pass, 0 fail (duration ~151 s). `npm run typecheck` (`tsc --noEmit`) → clean, no warnings. `npm run check:invariants` → exit 0, including `structural-invariants: ok -- src/cli.ts terminal-failure bookkeeping single-implementation…: 1`.

**Coverage command and percentages:** `npm run test:coverage` → all files Line 39.09% / Branch 86.86% / Function 44.90% (aggregate includes large untested vendored TUI surface, unchanged by this cycle). All per-file floors pass via `npm run check:coverage`: `scripts/structural-invariants.mjs` 95.45% ≥ 90%; `src/engine/halt-accounting.ts` 100% ≥ 100%; every other floored file `ok`. No per-file regression — this cycle touches only the checker data table (a `.mjs` literal) and test/fixture files.

**Deviation from PLAN.md:** PLAN.md's `setup` extension defaulted `cliContent = "// stub"`, but with the new `expected: 1` cli rule a bare `// stub` (0 occurrences) fails the rule, breaking the two pre-existing two-arg triage tests (the clean test asserts empty stderr / exit 0). Resolved by defaulting `cliContent` to `"// stub\nconsecutiveFailures += 1;\n"` so two-arg callers carry exactly the single sanctioned occurrence and satisfy the new rule — keeping the two pre-existing triage tests passing while preserving the explicit-content path used by the new violation/clean tests. This is within SPEC scope (test-harness only) and is the minimal correct adjustment to the planned signature change.

**Failure modes handled:** The new rule's failure path (re-inlined mutation → exit 1 with `src/cli.ts`, reason substring, and `expected 1` / `got 2` mismatch in stderr) is covered by the violation test; the violation surfaces and is never swallowed. The vacuous-rule risk (pattern matching zero) is guarded by the unchanged real-repo regression-pin test asserting live count == 1. The existing unreadable-target path (exit 2) is preserved unchanged. Test I/O failure modes (`mkdtemp`/`readFile`/`writeFile` rejections) propagate through `node:test`; each test uses a unique temp root removed in `finally` via `rm(..., { recursive: true, force: true })` — idempotent and re-run safe. No `try/catch` swallows errors; the only `try` wraps cleanup.

**Documentation:** No CLAUDE.md / AGENTS.md / README.md edit required — the Structural-invariants policy section already names the `INVARIANTS` table as the single source of truth and documents the `npm run check:invariants` enforcement path, and SPEC marks doc edits optional for this internal build-time guard.

**Deferred work / follow-up:** None. The agent-fleet REGISTRY consistency drift hazard noted in CLAUDE.md remains explicitly out of scope per SPEC.

## Touched Files
- scripts/structural-invariants.mjs
- tests/scripts/structural-invariants.test.ts
- tests/fixtures/structural-invariants/cli-violation.ts
- tests/fixtures/structural-invariants/cli-clean.ts
