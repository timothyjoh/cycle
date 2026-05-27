All three files were updated in commit `ad4a85e` (already on master). The working tree is clean — all cycle 0257 documentation changes are in place. Now writing the build summary.

## Summary

Cycle 0257 is a documentation-only cycle. All three target files (`README.md`, `BRIEF.md`, `docs/ARCHITECTURE.md`) were already updated in commit `ad4a85e` on master before this build step ran, which means the documentation step from a prior invocation landed the changes. The build step confirmed each acceptance criterion passes and the test suite is green.

**All PLAN.md tasks complete:**

- **Task 1 (README.md):** `README.md:162` — rate-limit bullet replaced. No mention of exit `42`; describes in-process pause/retry loop, `engine.paused { reason: "rate_limit", retry_at }`, `engine.resumed { reason: "rate_limit_cleared" }`, and `engine.rate_limit_backoff_ms` (default 3,600,000 ms). ✓
- **Task 2 (BRIEF.md):** `BRIEF.md:191–197` — rate-limit bullet replaced. No exit `42`; documents `engine.paused`, in-process retry, `engine.resumed`, and no `consecutive_failures` increment. ✓
- **Task 3a (ARCHITECTURE.md exit-code):** `docs/ARCHITECTURE.md:189–191` — exit-code bullet replaced; `42` removed; states engine does not exit on rate-limit. ✓
- **Task 3b (ARCHITECTURE.md JSONL block):** `docs/ARCHITECTURE.md:221–222` — `rate_limit.hit` line gone; `retry_after` → `retry_at`; `engine.resumed` line added; "not yet emitted" note removed. ✓
- **Task 3c (ARCHITECTURE.md failure-modes table):** `docs/ARCHITECTURE.md:573` — two-row short/long split collapsed to single unified row; exit `42` gone; `engine.rate_limit_backoff_ms` documented. ✓

**Verification greps:**
- `grep '42' README.md BRIEF.md docs/ARCHITECTURE.md | grep -i 'rate\|exit'` → no hits ✓
- `grep 'not yet emitted\|rate_limit\.hit\|retry_after\|Rate limit (long)\|Rate limit (short)' README.md BRIEF.md docs/ARCHITECTURE.md` → no hits ✓
- `grep 'rate_limit_backoff_ms' README.md BRIEF.md docs/ARCHITECTURE.md` → 3 hits (all three files) ✓
- `grep 'engine\.resumed' README.md BRIEF.md docs/ARCHITECTURE.md` → 4 hits ✓

**Test suite:** `npm test` — **763 pass, 0 fail, 0 skip** (duration: 685,598 ms).

**Coverage:** `npm run test:coverage` — **Line 98.71% / Branch 92.71% / Function 92.86%** (base was Line ≥ 95%, Branch ≥ 75%, Function ≥ 90% — all floors met, no regressions). One pre-existing flaky test (`stale lock → supervisor reclaims and exits 0`) failed in the coverage run (exit code null vs 0); this test passed in the `npm test` run and is a known intermittent issue (observation 4408) unrelated to this cycle's changes.

**Deviations from PLAN.md:** None. PLAN.md anticipated surgical string replacements; the changes were already in place, requiring only verification.

**Deferred / follow-up:** The `"429"` bare substring false-positive risk in `isRateLimitError` is tracked in `inbox/` as noted in SPEC §Out of Scope.

## Touched Files

No files were created or modified by this build step — the documentation changes were already committed to master. The three files changed by this cycle are listed for record:

- README.md
- BRIEF.md
- docs/ARCHITECTURE.md
