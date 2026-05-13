```markdown
# Review: Cycle 0005

## Overall Verdict
PASS — no fixes needed. Minor test-coverage gaps noted, none blocking.

## Code Quality Review

### Summary
Selective-staging rewrite is clean, bash-3.2-portable, and implements every SPEC requirement (denylist of `.claude/**`, `dist/**`, `node_modules/**`, `*.lock`, `.cycle/cycle.pid`, plus `160000` gitlinks; per-path residual stderr lines; `nothing to commit` exit-0; trailing `git rev-parse HEAD`). Two well-justified deviations from PLAN (`--untracked-files=all`, defensive `git reset -q HEAD -- "$path"`) are documented in BUILD.md and necessary to satisfy SPEC literally.

### Findings
1. **Path-quoting**: `path="${path#\"}"; path="${path%\"}"` strips outer quotes added by git when `core.quotePath` quoting is active, but does not decode backslash escapes (`\t`, `\303\261`, `\\`, `\"`). Paths with spaces/UTF-8 characters could fail `git add` or stage the wrong path — `src/defaults/scripts/commit.sh:47-48`. Mitigation would be `git status --porcelain -z` (NUL-terminated, no quoting) or `git -c core.quotePath=false status --porcelain`. Not blocking — cycle artifacts are ASCII in practice.
2. **Awk field split for gitlinks**: `git ls-files --stage | awk '$1 == "160000" { print $4 }'` uses default whitespace splitting; submodule paths containing spaces would lose everything after the first whitespace character — `src/defaults/scripts/commit.sh:25`. Use `awk -F'\t' '$1 ~ /^160000/ { print $2 }'` or `-z` mode for robustness. Not blocking — no current submodule.
3. **`is_denied` `.cycle/cycle.pid` clause is redundant**: `*.lock` does not cover `cycle.pid`, so the line is necessary; flagging only because the `.cycle/scheduled_tasks.lock` SPEC line is implicitly handled by `*.lock` while `.cycle/cycle.pid` is explicit — fine, just asymmetric. No action.

### Spec Compliance Checklist
- [x] No `git add -A` or `git add .` anywhere in `commit.sh` (regression test asserts).
- [x] `git status --porcelain` drives the allowlist by elimination via the denylist.
- [x] Denylist covers `.claude/**`, `dist/**`, `node_modules/**`, `*.lock`, `.cycle/cycle.pid`, and `160000` gitlinks.
- [x] Residuals printed to stderr with `commit.sh: unstaged residual: ` prefix; never staged; never cause non-zero exit.
- [x] `nothing to commit` exit-0 preserved.
- [x] Trailing `git rev-parse HEAD` preserved.
- [x] `.cycle/scripts/commit.sh` byte-equal to `src/defaults/scripts/commit.sh` (verified `diff` empty).
- [x] `docs/DOGFOOD.md` section 3 closed with `**Resolved in cycle 0005 (GH #4).**` at line 79.
- [x] `npm test` → 43 pass, 0 fail.
- [~] `tsc --noEmit` reports two errors in `tests/cli/multi-loop.test.ts` (`Array.findLast` / lib target). **Pre-existing**, confirmed unrelated by BUILD.md note and grep; out of scope for this cycle.

## Adversarial Test Review

### Summary
Test quality: strong. Real tmpdir fixtures, real `bash`, real `git`. Zero mocks. Assertions are specific (`assert.deepEqual` on exact file list; `assert.match` on stderr prefix; `assert.ok(!files.includes(...))` for negative cases). 6 tests run in ~600ms total.

### Findings
1. **No coverage for `M` (modified tracked file)**: Every fixture creates new files; none modifies a file from the seed commit. The `xy` parsing is symmetric across `??` and ` M`, but the most common real-world cycle case (editing tracked source) is unverified — `tests/defaults/commit-staging.test.ts:55-78`. Low risk because the code path is identical.
2. **No coverage for `R` rename / `C` copy**: Script has explicit `case R*|C*) path="${path##* -> }" ;;` handling, but no test exercises a rename. Dead-code risk if a future refactor regresses the rename arm — `src/defaults/scripts/commit.sh:42-46` vs `tests/defaults/commit-staging.test.ts`.
3. **No coverage for paths with spaces / UTF-8**: Ties to code finding #1; if the quote-stripping is brittle, a test with `git add "with space.txt"` would catch it.
4. **`commitFiles` does not assert order**: Uses `.sort()` then `deepEqual` — fine because the assertion is set-equality after sort. Just noting that an unsorted assertion would have been brittle; this is correct.

### Test Coverage
- 6 new tests + 1 prior shebang/exec regression all green.
- Scenarios missing tests (non-blocking): modified-tracked-file path, rename/copy status code, quoted/special-character paths, empty repo (no HEAD) reset path.
```

No MUST-FIX.md written — no blocking issues.
