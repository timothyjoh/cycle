# SPEC — Cycle 0014: Register Structural Invariant Pinning Single Terminal-Failure Bookkeeping Implementation

## Objective
Cycle 0013 extracted the triplicated terminal-failure bookkeeping in `src/cli.ts` into the single `recordTerminalFailure` helper (`src/engine/halt-accounting.ts`), but that de-duplication is currently convention-only: nothing mechanically prevents a future edit from re-inlining the `consecutiveFailures += 1` / `failedCycles.push(...)` accounting sequence at one of the supervisor call sites and silently re-introducing the exact drift hazard cycle 0013 eliminated. This cycle makes the de-duplication self-enforcing by registering a build-time structural invariant in `scripts/structural-invariants.mjs` that fails `npm run check:invariants` if the inlined bookkeeping mutation appears anywhere in `src/cli.ts` beyond the one legitimate resume-block exception.

## Source Issue
`refl-0013-register-structural-invariant-pinning-si` — "Register structural invariant pinning single terminal-failure bookkeeping impl"

## Scope

### In Scope
- Add one `INVARIANTS`-table entry in `scripts/structural-invariants.mjs` that pins the count of the inlined terminal-failure bookkeeping mutation (`consecutiveFailures += 1` paired with `failedCycles.push(...)`) in `src/cli.ts` to exactly its current legitimate occurrence count (the resume block), so any re-inlined call-site occurrence fails the check.
- Extend `tests/scripts/structural-invariants.test.ts` with a violation fixture and a clean fixture proving the new rule fails on re-inlined bookkeeping and passes on the current single-implementation layout.

### Out of Scope
- Any change to the runtime terminal-failure bookkeeping behavior, the `recordTerminalFailure` helper, or the supervisor control flow in `src/cli.ts`. This is a build-time guard only.
- Refactoring or generalizing the `INVARIANTS` checker mechanism (e.g. multi-file rules, AST-based matching). The existing per-file regex-count posture is reused as-is.
- Adding invariants for any other drift hazard (agent-fleet REGISTRY consistency, etc.).

## Requirements
- The new `INVARIANTS` entry MUST target `src/cli.ts` and use a regex that matches the real inlined bookkeeping sequence (the `consecutiveFailures += 1` increment that is paired with a `failedCycles.push(...)` mutation) without false-positively matching the functional, non-mutating form used inside `recordTerminalFailure` (`prev.consecutiveFailures + 1` / `[...prev.failedCycles, opts.cycleId]`).
- The `expected` count MUST equal the current number of legitimate occurrences in `src/cli.ts` (the resume block at `cli.ts` is the sole sanctioned in-place accounting site; the three commit-failure / fast-bail / budget-exhausted branches already delegate to `recordTerminalFailure`). The entry's `reason` string MUST name the rule clearly (e.g. mention terminal-failure bookkeeping single-implementation and the resume-block exception).
- Running `npm run check:invariants` against the current repo MUST continue to exit 0 (no regression to existing invariants, new rule passes at current state).
- The change MUST be confined to `scripts/structural-invariants.mjs` and the test/fixtures under `tests/`. No production engine source is modified.
- **Failure behavior**: When a future edit re-inlines the bookkeeping mutation at a supervisor call site, `npm run check:invariants` MUST exit non-zero (exit 1) and print a `structural-invariants: FAIL src/cli.ts -- <reason>: expected <N>, got <N+1>` line to stderr — the violation must surface, never be swallowed. The existing target-file-unreadable path (exit 2) is preserved unchanged. The regex must not silently degrade to matching zero (which would make the rule vacuous); the regression-pin test against the real repo root guards against an over-tight pattern that matches nothing.

## Acceptance Criteria
- [ ] `scripts/structural-invariants.mjs` contains exactly one new `INVARIANTS` entry whose `file` is `src/cli.ts` and whose `reason` references the terminal-failure bookkeeping single-implementation rule.
- [ ] `npm run check:invariants` exits 0 against the current repository and its stdout includes an `ok` line for the new `src/cli.ts` rule.
- [ ] A new test in `tests/scripts/structural-invariants.test.ts` writes a `src/cli.ts` fixture containing the bookkeeping sequence inlined more than the expected number of times, runs the checker, and asserts exit status 1 with stderr containing `src/cli.ts`, the rule's `reason` substring, and the `expected … got …` mismatch text.
- [ ] A new (or extended) test writes a `src/cli.ts` fixture matching the current single-implementation layout and asserts the checker exits 0 with no stderr for that rule.
- [ ] The existing "real repo root -> exit 0 (regression pin)" test still passes, confirming the new pattern matches the sanctioned occurrence count and is not vacuous against the live `src/cli.ts`.
- [ ] All existing tests still pass (`npm test`).
- [ ] No compiler/linter warnings introduced (`npm run typecheck`).

## Testing Strategy
- Node built-in test runner (`node:test` with `node:assert/strict`), matching the existing `tests/scripts/structural-invariants.test.ts` conventions: spawn the checker via `spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" })` against a temp directory populated with stub source files.
- Update the shared `setup` helper (or add a parallel helper) so the temp tree can hold a `src/cli.ts` fixture with controllable bookkeeping content, since the current `setup` writes only a `// stub` for `src/cli.ts`.
- Scenarios to cover:
  - **Happy path / clean**: current single-implementation `src/cli.ts` fixture → exit 0, no stderr for the new rule.
  - **Failure path / violation**: bookkeeping sequence inlined an extra time → exit 1 with file, reason, and expected/got mismatch in stderr.
  - **Regression pin**: the existing real-repo-root test continues to pass, proving the live count matches `expected` and the pattern is non-vacuous.
- Add fixture files under `tests/fixtures/structural-invariants/` if a file-based fixture is preferred over inline string content, consistent with the existing `triage-violation.ts` / `triage-clean.ts` fixtures.

## Documentation Updates
- **CLAUDE.md / AGENTS.md**: No convention or command change is required — the structural-invariants policy section already documents the `INVARIANTS` table as the single source of truth and the `npm run check:invariants` enforcement path. No edit needed unless the new rule's existence warrants a one-line mention; if so, note the terminal-failure bookkeeping invariant alongside the existing structural-invariants policy note.
- **README.md**: No user-facing change; the invariant is an internal build-time guard.

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Existing `scripts/structural-invariants.mjs` checker harness and its `INVARIANTS` table.
- Existing `tests/scripts/structural-invariants.test.ts` and `tests/fixtures/structural-invariants/` fixture directory.
- The current `src/cli.ts` containing exactly one inlined bookkeeping occurrence (the resume block) and three delegating `recordTerminalFailure` call sites, plus `src/engine/halt-accounting.ts` holding the sole helper implementation.
- No external services or environment variables required.
