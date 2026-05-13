# Must-Fix Items: Cycle 0006

## Summary
1 minor issue found in review. Code is functionally spec-compliant; one diagnostic message will always print a misleading `(exit 0)` on fallback failure due to bash `$?` semantics after a failed `if`-condition.

## Tasks

- [x] ### Task 1: Capture fallback exit code correctly
  **Status:** ✅ Fixed
  **What was done:** Replaced the `if gh pr merge ...; then ... fi; fallback_rc=$?` block in `src/defaults/scripts/pr.sh` with the exit-code-preserving `fallback_rc=0; gh pr merge ... || fallback_rc=$?; if [ "${fallback_rc}" -eq 0 ]; then ...` idiom. Ran `npm run sync-defaults` (`.cycle/scripts/pr.sh` now byte-equal). Added the optional source-shape regression guard test to `tests/defaults/pr-auto-merge-fallback.test.ts`. `bash -n` clean, diff empty, sanity check prints `captured=7`, and `npm test` reports 50/50 pass.
  **Priority:** Minor
  **Files:** `src/defaults/scripts/pr.sh`, `.cycle/scripts/pr.sh`
  **Problem:** At `src/defaults/scripts/pr.sh:41-47`, the code is:
  ```bash
  if gh pr merge "${pr_number}" --squash --delete-branch; then
    echo "${pr_url}"
    exit 0
  fi
  fallback_rc=$?
  echo "pr.sh: auto-merge failed: ${err}" >&2
  echo "pr.sh: immediate-merge fallback also failed (exit ${fallback_rc})" >&2
  exit 1
  ```
  Per bash/POSIX spec, `$?` after an `if cond; then body; fi` where `cond` returned non-zero is **0** (no condition tested true). Verified: `bash -c 'if (exit 7); then echo y; fi; echo $?'` prints `0`. The line `fallback_rc=$?` therefore always captures `0` when the fallback `gh pr merge` fails, and the diagnostic on line 47 always prints `(exit 0)` regardless of the real fallback failure code. The script still exits 1, so user-facing exit behavior is correct — only the stderr diagnostic is wrong.

  **Fix:** Replace lines 41-48 of `src/defaults/scripts/pr.sh` with an exit-code-preserving form:
  ```bash
  fallback_rc=0
  gh pr merge "${pr_number}" --squash --delete-branch || fallback_rc=$?
  if [ "${fallback_rc}" -eq 0 ]; then
    echo "${pr_url}"
    exit 0
  fi
  echo "pr.sh: auto-merge failed: ${err}" >&2
  echo "pr.sh: immediate-merge fallback also failed (exit ${fallback_rc})" >&2
  exit 1
  ```
  Then run `npm run sync-defaults` to propagate to `.cycle/scripts/pr.sh`.

  **Verify:**
  1. `bash -n src/defaults/scripts/pr.sh` → exit 0 (syntax OK).
  2. `diff -q src/defaults/scripts/pr.sh .cycle/scripts/pr.sh` → empty.
  3. `npm test` → all 49 tests pass.
  4. Sanity check the semantics:
     ```bash
     bash -c '
       set -euo pipefail
       fallback_rc=0
       (exit 7) || fallback_rc=$?
       echo "captured=${fallback_rc}"
     '
     ```
     must print `captured=7`.
  5. Optional source-shape regression guard: add to `tests/defaults/pr-auto-merge-fallback.test.ts`:
     ```ts
     test("pr.sh: fallback exit code captured via || idiom, not post-if $?", () => {
       const src = readFileSync(PR_SH, "utf8");
       assert.match(
         src,
         /gh pr merge "\$\{pr_number\}" --squash --delete-branch \|\| fallback_rc=\$\?/,
       );
     });
     ```
