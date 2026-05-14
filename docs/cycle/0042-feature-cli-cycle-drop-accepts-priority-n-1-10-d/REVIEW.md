Verdict: PASS. No MUST-FIX needed. Emit REVIEW.md content to stdout.

```markdown
# Review: Cycle 0042

## Overall Verdict
PASS — no fixes needed.

## Code Quality Review

### Summary
Tight, well-scoped vertical slice. `parseArgs` switches the `drop` branch to `node:util parseArgs` mirroring the `run` branch precedent; integer-range validation is a single regex + bounds check; `materializeFreeformIssue` gains one defaulted parameter that preserves all existing call-site behavior. SPEC acceptance criteria all met, no scope creep into `run`, triage, queue, or a generalized help framework.

### Findings
1. **Style / minor**: error-message inconsistency — the range-error string at `src/cli/parse-args.ts:44-46` says `usage: cycle drop "<text>" [--priority N]` without re-stating the `1..10` range or the `3` default, while the wrap of `nodeParseArgs`'s native error at `src/cli/parse-args.ts:30-34` includes the full `N is an integer 1..10, default 3` hint. SPEC §Functional says the usage string should document range + default. Range is implicit in the rejection text (`must be an integer 1..10`); default is not. Cosmetic, not a correctness issue.
2. **Style / minor**: `src/cli.ts:69` passes `new Date()` explicitly to make room for `args.priority`. Matches PLAN.md call-out but worth noting the helper's default and the explicit value are identical — no behavior change, just a readability choice.
3. **Positive**: `materializeFreeformIssue` keeps `priority` as a plain defaulted positional parameter rather than an options bag — the right call for a 2-of-4 default override. No needless abstraction. — `src/issue/materialize.ts:5-10`.
4. **Positive**: validator order is correct — regex first (`/^-?\d+$/`) rejects `"3.5"` and `"high"` before `Number(...)` would silently produce `NaN`/round, and `Number.isInteger` is defense-in-depth. — `src/cli/parse-args.ts:43`.

### Spec Compliance Checklist
- [x] `cycle drop "<text>" --priority N` writes `priority: N` to the raw frontmatter. (parse-args + e2e tests.)
- [x] `cycle drop "<text>"` writes `priority: 3` (existing pin test continues to lock this — `tests/issue/materialize.test.ts:21-29`).
- [x] Rejection of `0`, `11`, `3.5`, `"high"`, and missing value, each with non-zero exit and a stderr message naming the flag and the `1..10` range. (parse-args unit tests + e2e rejection test.)
- [x] Flag-before-text and flag-after-text both succeed (`tests/cli/parse-args.test.ts:36-44`).
- [x] Success stdout unchanged: single JSON line with `event: "issue.dropped"`, `issue_id`, `path` (`tests/cli/drop-priority.test.ts:18-21`).
- [x] `npm run typecheck` clean. `npm test` 342 / 342 pass. Coverage line 98.55 / branch 91.57 / func 96.23 — above master baseline 95/75/90, no per-file regression. `parse-args.ts` 100/94.74/100; `materialize.ts` 100/100/100.
- [x] CLAUDE.md not touched (Commands table does not list `drop`, confirmed). README.md updated with one extra example line + one explanatory sentence (`README.md:104-108`).
- [x] No `--priority` flag added to `run`; `src/cli.ts:78` left untouched (defaults to `3` via the parameter default).
- [x] No new runtime dependencies; parser still on `node:util parseArgs`.

## Adversarial Test Review

### Summary
Strong. Zero mocks. Both layers (parser + materialize) have direct unit tests; the e2e spawn test exercises the real `dist/cycle.js` binary against a temp repo and reads the on-disk frontmatter back. Boundary cases (1, 10) and every documented rejection mode (0, 11, 3.5, "high", missing value) are covered. Existing frontmatter pin test is preserved so the field order cannot drift silently.

### Findings
1. **Weak assertion (minor)**: `tests/cli/parse-args.test.ts:86-91` asserts the missing-value rejection only matches `/drop:/`. That regex would pass for *any* drop error, including the unrelated "drop requires task text" case. Tighten to match the wrapped usage string, e.g. `/usage: cycle drop/` or `/Option '--priority|priority' argument missing/i`. Does not change correctness, just makes the test less of a tautology. — `tests/cli/parse-args.test.ts:89`.
2. **Coverage gap (minor)**: there is no parser test for `--priority -3` or `--priority -1`. The regex `/^-?\d+$/` accepts `-3` so it would reach the bounds check and be rejected by `n < 1` — but in practice `node:util parseArgs` may interpret `-3` as a short flag and throw before our validator runs. Behavior is correct either way; the test gap leaves the chosen path undocumented. Optional.
3. **Coverage gap (minor)**: no e2e test for flag-before-text ordering. The parser test covers it, so this is double-coverage rather than a true gap; only worth adding if you want the integration path verified end-to-end. Optional.
4. **Positive**: `tests/cli/drop-priority.test.ts:23` asserts the on-disk frontmatter via `/^priority: 5$/m` with end-of-line anchor — would correctly reject `priority: 50`, `priority: 5x`, etc. Specific assertion, not a substring sniff.
5. **Positive**: temp-dir-per-test pattern with `mkdtemp` + `rm({ recursive: true, force: true })` in `finally`. No shared state, no order dependence, no leakage on the rejection path either (the binary exits before any fs write).
6. **Positive**: existing `tests/issue/materialize.test.ts:21-29` six-field pin test was *not* weakened — the new explicit-priority test at `tests/issue/materialize.test.ts:42-56` uses a position-agnostic `assert.match(/^priority: 7$/m)` so it does not double-lock the field order. Locking the order in one place and the value in the other is the right split.

### Test Coverage
- Command run: `npm run test:coverage`
- Line / branch / function: **98.55% / 91.57% / 96.23%** (baseline: line ≥ 95%, branch ≥ 75%, function ≥ 90% — all clear).
- Regressions vs base (per-file): none. Touched files all moved up or stayed at 100% (`parse-args.ts`: 100% line, 94.74% branch, 100% function; `materialize.ts`: 100% across).
- New code without tests: none. All new branches (range fail, regex fail, missing value, valid override, default) are exercised.
- Specific scenarios missing tests (all optional, not blocking): negative-priority edge case (`-3`), `--priority=N` equals-form, flag-before-text via e2e.
```

Cycle 0042 review: PASS. 342 tests green, coverage 98.55/91.57/96.23 (no regression), all SPEC acceptance criteria met. No MUST-FIX.md emitted. Minor observations (weak missing-value test assertion, message-string inconsistency between rejection paths, no negative-number / equals-form edge cases) all logged in REVIEW.md as non-blocking notes.
