Now stdout REVIEW.md:

```markdown
# Review: Cycle 0006

## Overall Verdict
NEEDS-FIX — see MUST-FIX.md (1 minor diagnostic-message issue; no critical or spec-blocking issues).

## Code Quality Review

### Summary
Implementation matches SPEC and PLAN cleanly. `pr.sh` captures first-attempt stderr, branches on the two documented detection tokens, falls back to a synchronous `--delete-branch` merge, and preserves the `${pr_url}` stdout contract on both success paths. Byte-equal sync to `.cycle/scripts/pr.sh` verified, `bash -n` syntax clean, all 49 tests pass. One minor bug: the fallback failure path captures `$?` after a failed `if`-condition, which is always `0` per bash spec — the diagnostic on line 47 will misreport the real fallback exit code.

### Findings
1. **Diagnostic correctness (minor)**: `fallback_rc=$?` after `if gh pr merge ... ; then ... fi` is always `0` when the `gh` invocation fails (POSIX/bash: `$?` after an `if` whose condition tested false is `0`). The "(exit ${fallback_rc})" message will always say "(exit 0)". Script still exits 1, so user-visible exit code is correct; only the stderr diagnostic is wrong. — `src/defaults/scripts/pr.sh:41-47`
2. **Stdout discipline (positive)**: `err=$(gh pr merge "${pr_number}" --squash --auto 2>&1 1>/dev/null) || rc=$?` correctly captures only stderr while discarding `gh`'s stdout, preventing accidental contamination of the `pr_url` contract. Redirection order is correct. — `src/defaults/scripts/pr.sh:19`
3. **`set -e` honor (positive)**: `rc=0; cmd || rc=$?` idiom keeps `set -euo pipefail` intact while suspending abort for the captured branch. — `src/defaults/scripts/pr.sh:18-19`
4. **Detection tokens (positive)**: `case` glob matches both the GraphQL identifier and the human-readable substring; belt-and-braces guard against GitHub rewording. — `src/defaults/scripts/pr.sh:40`
5. **Stderr-label convention (positive)**: New diagnostics adopt the existing `pr.sh: ` prefix used elsewhere in the script. — `src/defaults/scripts/pr.sh:46-47`
6. **Sync convention (positive)**: `diff -q src/defaults/scripts/pr.sh .cycle/scripts/pr.sh` empty — cycle 0005 byte-equality convention preserved.
7. **Doc update (positive)**: `docs/DOGFOOD.md:67-70` records the resolution under §2, references cycle 0006 / GH #5, and links to the prior observation.

### Spec Compliance Checklist
- [x] First attempt is `gh pr merge "${pr_number}" --squash --auto`.
- [x] Detects `enablePullRequestAutoMerge` AND `Auto merge is not allowed for this repository`.
- [x] On detection match, invokes `gh pr merge "${pr_number}" --squash --delete-branch` synchronously.
- [x] On fallback success, echoes `${pr_url}` to stdout and exits 0; poll loop skipped.
- [x] On non-matching first error, prints original stderr and exits non-zero (`exit "${rc}"` preserves original gh exit code).
- [x] On fallback failure, both errors written to stderr; script exits non-zero. **Caveat**: fallback exit code in the diagnostic is misreported as `0` — see Finding 1.
- [x] `set -euo pipefail` preserved on line 4.
- [x] Stdout `${pr_url}` contract preserved on both success paths.
- [x] New source-shape test added at `tests/defaults/pr-auto-merge-fallback.test.ts`.
- [x] All existing tests pass (`npm test`: 49 pass, 0 fail).
- [x] `src/defaults/scripts/pr.sh` and `.cycle/scripts/pr.sh` byte-equal.
- [x] `docs/DOGFOOD.md` updated.
- [x] No CLAUDE.md / AGENTS.md changes required (none made).

## Adversarial Test Review

### Summary
Test quality: **adequate for the SPEC-imposed discipline**. SPEC explicitly bans live `gh` shell-out in unit tests and prescribes source-shape assertions; the new file follows that pattern faithfully and mirrors `tests/defaults/commit-staging.test.ts`. The assertions are coarse (literal-substring greps), which means they verify the source *contains* the right tokens but cannot verify *runtime behavior*. The minor `fallback_rc=$?` bug is not detectable by these tests — that is inherent to the source-shape approach, not a defect of the test file.

### Findings
1. **No behavioral coverage (by design)**: Tests cannot catch wiring bugs like the `$?`-after-`if` issue. This is SPEC-mandated discipline (no `gh` shell-out in unit tests); the live cycle run is the behavioral signal. — `tests/defaults/pr-auto-merge-fallback.test.ts:1-52`
2. **Coarse count assertions (minor)**: The `pr.sh: ` label count and `echo "${pr_url}"` count both use `>=2`. A future contributor could add a comment containing `pr.sh: ` or a dead-code echo and the test would still pass without the diagnostic actually being wired. Acceptable trade-off given the SPEC discipline, but easy to harden (see Suggestion below). — `tests/defaults/pr-auto-merge-fallback.test.ts:32-36, 46-50`
3. **Detection-token test is stricter than SPEC (positive)**: SPEC says "either token". Test requires both. Implementation includes both via the `case` glob, so the stricter test is fine and gives a sharper regression guard.
4. **Test independence (positive)**: Each test reads the source fresh; no shared mutable state; order-independent.
5. **Assertion quality (positive)**: Uses `assert.match` against precise regexes (`gh pr merge "\$\{pr_number\}" --squash --auto`) rather than weak truthiness checks.
6. **No `bash -n` syntax guard in CI (gap)**: If a future change introduces a syntax error in `pr.sh`, no test would catch it. `tests/defaults/scripts.test.ts` checks shebang/exec bit only. Out of scope for this cycle but worth flagging for a follow-up.
7. **Missing regression guard for the `$?` bug**: A targeted shape assertion (`gh pr merge … --delete-branch || fallback_rc=$?`) would have caught the diagnostic bug at red-test time. Suggested as part of MUST-FIX Task 1's verify step.
8. **Mock usage**: zero. No mock-abuse risk.

### Test Coverage
- **Asserted scenarios** (6/6 SPEC source-shape items):
  - `--auto` first-call shape ✓
  - Both detection tokens present ✓
  - `--delete-branch` fallback call shape ✓
  - `>=2` `${pr_url}` echo sites (poll + fallback) ✓
  - 30-min poll deadline regression guard ✓
  - `>=2` `pr.sh:` stderr prefixes (label convention) ✓
- **Missing scenarios** (acceptable under SPEC discipline, but worth noting):
  - Fallback exit code is captured via `||` idiom, not post-`if` `$?` (would have caught the bug in this review).
  - Fallback success path does NOT continue into the poll loop (negative assertion — currently inferred from `exit 0` site count).
  - `case` branch literally encloses the `--delete-branch` invocation (currently only proven by colocation, not by parser-level test).
  - `bash -n` clean (covered manually, not in CI).
- **Coverage numbers**: not measured; `node:test` runs 49 tests pass.
```

Wrote `MUST-FIX.md` flagging minor diagnostic bug. Implementation otherwise spec-compliant.
