## Summary

This cycle adds the durable build-time regression guard the source issue requested under *"Close the blind spot"* — converting the runtime-only `codex exec` protection into a structural invariant. All four PLAN.md tasks are complete.

### Files modified

- **`scripts/structural-invariants.mjs`** (+20 lines): Added one count-based invariant entry immediately after the existing `CYCLE_CODEX_BIN` codex entry, pinning the `exec` subcommand argv construction in `src/engine/exec-codex.ts`. Pattern `/const argv: string\[\] = \["exec"\]/g`, `expected: 1`, with a `reason` explaining the codex non-interactive-subcommand contract and a block comment documenting why the guard exists (bare `codex` rejects non-TTY stdin on codex-cli ≥ 0.136). **Task 1 complete.**
- **`tests/scripts/structural-invariants.test.ts`** (~50 lines): (a) Extended the `setup()` codex lane stub to append `const argv: string[] = ["exec"];` so the new `expected: 1` pattern is satisfied against every CLI-fixture subprocess test (**Task 2**); (b) widened the existing import to also pull in `INVARIANTS`; (c) added a happy-path test asserting the codex-`exec` entry is present in the real `INVARIANTS` and that `runInvariants([entry], process.cwd())` returns `0` against the real `exec-codex.ts`; (d) added a failure-path test that writes a synthetic bare-`codex` lane (`const argv: string[] = [];`) into a temp tree and asserts `runInvariants` returns a failure count ≥ 1 with a stderr `FAIL` line naming `src/engine/exec-codex.ts`. **Task 3 complete.**
- **`CLAUDE.md`** (1 clause): Amended the registered-step-agents `codex` clause to note the `exec` subcommand is now build-time-pinned by a structural invariant. No new section; no `docs/models.md` change. **Task 4 complete.**

No change was made to `src/engine/exec-codex.ts` behavior, argv, the `thinking`→`reasoning_effort` mapping, or `docs/models.md` — all out of scope and already shipped in `c341b6d`.

### Verification

- **Test suite**: `npm test` → `tests 1089`, `pass 1089`, `fail 0`.
- **Coverage**: `npm run test:coverage` → exit 0, no `coverage-gate: FAIL` and no `structural-invariants: FAIL`. Every per-file floor passed (e.g. `src/engine/run-cycle.ts 100.00% ≥ 90%`, `src/engine/preflight.ts 99.22% ≥ 95%`, `src/engine/shell.ts 100.00% ≥ 100%`). The c8 inline "all files" line reads 44.93 / 88.54 / 48.92 because that view counts untested scripts and test files; the authoritative metric in this repo is the LCOV-driven per-file gate (`scripts/coverage-gate.mjs`), which passed with no regression. The files I touched are not floored source modules; `scripts/structural-invariants.mjs` is exercised in-process by the new and existing tests via the `runInvariants`/`INVARIANTS` exports.
- **Invariants gate**: `node scripts/structural-invariants.mjs` → exit 0, emitting `ok -- src/engine/exec-codex.ts codex lane invokes \`codex exec\` (bare codex fails on non-TTY stdin): 1`.
- **Typecheck**: `npm run typecheck` → clean (the new entry conforms to the `@typedef Invariant` shape; the `.mjs` `@ts-check` annotations remain valid).
- **Codex unit tests**: `tests/engine/exec-codex.test.ts` (incl. the runtime `/^exec\b/` assertion) unchanged and green.

### Failure modes handled

- **Count divergence (the named regression)**: removing or altering the `["exec"]` argv construction drives `(text.match(pattern) ?? []).length` away from `expected: 1`, routing through the unchanged runner FAIL path (`console.error` `FAIL` line + non-zero CLI exit). Covered by the failure-path test feeding a synthetic `const argv: string[] = []` tree and asserting `failed >= 1` plus a stderr `FAIL` line naming the file — the SPEC's user-observable-benefit criterion.
- **No silent pass introduced**: the entry is pure declarative data; it adds no new code path, swallow, or fallback. An unreadable target file still surfaces through the gate's existing per-file read-error path as a failure, not a skipped check.
- **`setup()` stub-write failure**: rejects the test's async `setup()` and fails loudly in `node:test`; no try/catch added. `setup()` writes against a fresh `mkdtemp` tree per test and is overwrite-based — idempotent across re-runs.
- **Test resource hygiene**: both new tests restore `console.error` in `finally`; the failure-path test removes its temp tree in `finally`.

### Deviations from PLAN.md

None. The implementation follows the plan exactly, including the chosen pattern anchor (`const argv: string[] = ["exec"]`), the `setup()` codex stub special-case, and the two-test structure.

### Deferred work / follow-up

Per SPEC Out-of-Scope: auditing the gemini / auggie / opencode / pi lanes for the same interactive-vs-subcommand hazard, and an opt-in real-`codex` smoke test, are deliberately deferred to a sibling cycle should a real hazard be found.

## Touched Files
- scripts/structural-invariants.mjs
- tests/scripts/structural-invariants.test.ts
- CLAUDE.md
