All checks green. Verdict: PASS. Writing REVIEW.md to stdout (engine captures it). No MUST-FIX.md.

```markdown
# Review: Cycle 0056

## Overall Verdict
PASS — no fixes needed

## Code Quality Review

### Summary
Surgical, faithful split. `runCliTriage` body lifted verbatim into a new
`runCliTriageWithDeps` with a non-optional `deps: TriageDeps`; the new
two-arg `runCliTriage` is a one-line `return runCliTriageWithDeps(repoRoot, argv, {})`
delegate with no conditional logic. `src/cli.ts` is byte-identical to
master and the prod path can no longer pass a third argument because the
wrapper signature physically rejects it. Implementation matches PLAN.md
Tasks 1–3 exactly with zero deviations.

### Findings
1. **Signature compile-time guarantee**: Confirmed — `grep` of `src/`
   shows only two `runCliTriage(` call sites (`src/cli/triage.ts:42`
   wrapper definition + `src/cli.ts:59` prod call), both two-arg. Zero
   third-arg invocations.
2. **`deps` non-optional on with-deps export**: Confirmed — `deps: TriageDeps`
   at `src/cli/triage.ts:25` has no `= {}` default. TypeScript rejects
   omission.
3. **Wrapper body is hardcoded delegation**: Confirmed — `src/cli/triage.ts:46`
   is `return runCliTriageWithDeps(repoRoot, argv, {});`. No conditional,
   no factory.
4. **Return shape preserved byte-for-byte**: Identical
   `Promise<{ exitCode: number; stdout: string; stderr?: string }>` on
   both exports; body of `runCliTriageWithDeps` differs from prior
   `runCliTriage` only in the removed `= {}` default.
5. **`src/cli.ts` untouched**: `git diff master -- src/cli.ts` returns 0
   bytes. No change to the dispatch line.
6. **No new abstractions**: Per PLAN's "What we're NOT doing", the
   wrapper carries no factory / no real-deps construction / no
   future-proofing. Clean YAGNI.
7. **Pattern consistency**: Two same-file exports with the with-deps
   variant being the body-bearing one matches existing conventions
   throughout `src/engine/` (e.g. `dryRunTriage` itself accepts injected
   `deps`).

### Spec Compliance Checklist
- [x] `src/cli/triage.ts` exports both `runCliTriage` (two-arg) and
      `runCliTriageWithDeps` (three-arg, non-optional `deps`).
- [x] `grep -nE "runCliTriage\(" src/` shows zero third-arg call sites.
- [x] `src/cli.ts` byte-identical to master.
- [x] `tests/cli/triage-handler.test.ts` imports both; deps-injecting
      cases (lines 125, 146) use `runCliTriageWithDeps`; deps-free cases
      still use the two-arg `runCliTriage` wrapper.
- [x] All existing assertions pass unchanged (no `last_error` /
      `stdout` shape drift).
- [x] `npm test` / `npm run test:coverage` exit 0; `npm run check:coverage`
      exit 0.
- [x] `npm run typecheck` exits 0 with no warnings.
- [x] Per-file coverage on `src/cli/triage.ts` not worse than master —
      in fact improved to 100/100/100.
- [x] Documentation updates: SPEC explicitly says no doc edits warranted
      (internal split, no user-facing invariant). Confirmed.

## Adversarial Test Review

### Summary
Strong. The existing 6-test suite is preserved exactly; only two call
sites swap to the new with-deps export. Mocking is minimal and disciplined
— only `runAgent` is stubbed via the intended `TriageDeps` seam. Real
`mkdtemp` filesystem, real `loadConfig` parsing, real `dryRunTriage`
plumbing. Assertions are specific (`assert.equal(parsed[0].status, "ok")`,
`assert.match(result.stdout, /Usage: cycle triage --dry-run/)`).

### Findings
1. **Mock discipline**: Only `runAgent` is stubbed; everything else
   runs against real code. Setup is ~3 lines of mock per test versus
   ~10 lines of real fixture — well under the 50% mock-abuse threshold.
2. **Wrapper coverage is real, not theatrical**: Of the four deps-free
   tests, the empty-`raw/` `--dry-run` case (lines 72–81) reaches the
   wrapper's delegation line AND through `loadConfig` + `dryRunTriage`.
   The `--help` / `-h` / no-flag cases exercise wrapper entry and the
   early branches inside `runCliTriageWithDeps`. Together they fully
   cover the wrapper (now 100% line / 100% branch / 100% function).
3. **No happy-path-only bias**: Failure mode covered — `runCliTriage --dry-run failed report: exit 1`
   (line 137) stubs `runAgent` to return non-JSON, asserts `exit 1` and
   `status: "failed"`. The `no flag` case asserts `exit 2` and `stderr`
   help. Both failure paths through the with-deps body covered.
4. **Test independence**: Each test calls `repo()` to mkdtemp a fresh
   root and `rm` in `finally`. No shared mutable state. No order
   dependency.
5. **Assertion quality**: Specific structural assertions
   (`JSON.parse(result.stdout)` then `.length`, `.status`) rather than
   `toBeTruthy`. Stderr is checked with `assert.ok(result.stderr)` then
   pattern-matched.
6. **No new test files; no removed tests**: Matches SPEC's "no new
   tests" mandate. The contract surface is unchanged.

### Test Coverage
- Command run: `npm run test:coverage` (+ `posttest:coverage` =
  `node scripts/coverage-gate.mjs`)
- Tests: 381 pass / 0 fail / 0 skipped / 18.68s duration
- Aggregate: line 99.06% / branch 92.87% / function 96.34% — unchanged
  vs cycle 0055 baseline.
- Per-file deltas vs master:
  - `src/cli/triage.ts`: 100% / 100% / 100% (improved from prior; wrapper
    now collapses to a single statement that every existing test reaches).
  - `src/cli.ts`: not in per-file report before or after — no unit tests
    reach it (the integration line `src/cli.ts:59` is exercised only via
    the bundled `dist/cycle.js` entry point). Unchanged.
  - `src/engine/triage.ts`: 99.72% / 97.80% / 97.50% — byte-identical to
    cycle 0055 baseline.
- Regressions vs base (per-file): none.
- New code without tests: none. The wrapper's single delegation line is
  covered by every deps-free test; the with-deps body is covered by the
  two migrated deps-injecting tests plus the four wrapper-call tests
  that flow into it.
- Specific scenarios missing tests: none material. The compile-time
  guarantee that `runCliTriage` cannot accept a third arg is a
  TypeScript invariant, not a runtime path — verified via `grep` and
  `tsc --noEmit`, both clean.

### Minor Observations (NOT must-fix)
- `src/cli/triage.ts`'s two exports duplicate the return-type signature
  (`Promise<{ exitCode: number; stdout: string; stderr?: string }>`).
  Could `Awaited<ReturnType<typeof runCliTriageWithDeps>>` the wrapper —
  but that adds indirection for a one-line file and isn't worth the
  cognitive cost. Leave as is.
- `TriageDeps.runAgent` remains field-optional (`{ runAgent?: ... }`).
  PLAN's "Resolved Open Question 1" is explicit that field-level
  optionality stays; only the parameter is non-optional. Out of scope to
  tighten. Filed implicitly as future tightening if it ever causes a
  silent-default bug.
- SPEC.md / PLAN.md / BUILD.md outputs still carry stray outer
  ```` ```markdown ```` fences (sanitizer escape) — tracked separately
  as `refl-0055-sanitizer-narration-regex-too-narrow-sti`, not a 0056
  defect.
```

`★ Insight ─────────────────────────────────────`
- Compile-time injection lockout via signature shape (no third param) > convention/lint rule. Type checker enforces what a `grep` test can only audit.
- Wrapper's single-statement body means deps-free tests automatically cover delegation — no synthetic "wrapper-only" test needed. Coverage went UP, not down.
- Body lifted verbatim → behavior preserved by construction. Test suite is the contract; no new assertions needed.
`─────────────────────────────────────────────────`

Cycle 0056 passes review. No MUST-FIX.md written. Fix step skips.
