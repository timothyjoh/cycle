# Must-Fix Items: Cycle 0186

## Summary
1 critical issue found in review: two related errors on the same line of `docs/ENGINE.md` — wrong function name and undercounted emission sites.

## Tasks

- [x] ### Task 1: Fix two unbacked claims on ENGINE.md:92 — wrong function name and missing emission site
  **Priority:** Critical
  **Files:** `docs/ENGINE.md`
  **Problem:** Line 92 contains two errors introduced (or preserved) in this cycle's diff:

  1. `truncateStepEndStderr` does not exist in `src/engine/run-cycle.ts`. The actual call is `truncateHeadCapped(r.stderr, MAX_STEP_END_STDERR)` at `run-cycle.ts:275`.

  2. "Four emission sites" is an undercount. Cycle 0186 added `r.stderr = formatEmptyDiffGuardError(step.name)` at `run-cycle.ts:261` as a fifth emission site; the doc lists only four (UnknownAgentError, spec guard, fix guard, provider exit) and omits the new empty-diff guard.

  **Fix:** Edit `docs/ENGINE.md` line 92 to:
  - Replace `truncateStepEndStderr` with `truncateHeadCapped`
  - Change "Four emission sites" to "Five emission sites"
  - Insert a new entry between (3) and (4): `(4) empty-diff post-condition guard (\`run-cycle.ts:~261\`) — \`formatEmptyDiffGuardError(stepName)\``
  - Renumber the old (4) provider-module entry to (5)

  The corrected sentence should read:
  > `Five emission sites set \`r.stderr\` before the gate fires: (1) \`UnknownAgentError\` during dispatch (\`run-cycle.ts:~219\`) — error message verbatim; (2) spec post-condition guard (\`run-cycle.ts:~231\`) — \`formatSpecGuardError(path, bytes, SPEC_MIN_BYTES)\`; (3) fix post-condition guard (\`run-cycle.ts:~244\`) — \`formatFixGuardError(fixPath, mustFixPath, count)\`; (4) empty-diff post-condition guard (\`run-cycle.ts:~261\`) — \`formatEmptyDiffGuardError(stepName)\`; (5) provider-module non-zero exit in \`exec-claudecode.ts\`, \`exec-codex.ts\`, \`exec-gemini.ts\` — captured stderr stream, head-capped at 2000 chars.`

  **Verify:**
  - `grep -n "truncateStepEndStderr" docs/ENGINE.md` returns no matches
  - `grep -n "truncateHeadCapped" docs/ENGINE.md` returns line 92
  - `grep -n "Five emission" docs/ENGINE.md` returns line 92
  - `grep -n "formatEmptyDiffGuardError" docs/ENGINE.md` returns line 92
  - Cross-check: `grep -n "truncateHeadCapped" src/engine/run-cycle.ts` returns line 275

  **Status:** ✅ Fixed
  **What was done:** Replaced `truncateStepEndStderr` with `truncateHeadCapped` on ENGINE.md:92, changed "Four emission sites" to "Five emission sites", inserted new entry (4) for `formatEmptyDiffGuardError` at `run-cycle.ts:~261`, and renumbered old (4) to (5). All verify checks pass. Full test suite: 562/562 pass.
