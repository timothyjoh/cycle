---
id: refl-0255-429-bare-substring-match-in-combined-out
source: reflection
title: "\"429\" bare-substring match in combined output risks false positives"
added_at: "2026-05-26T07:40:30.097Z"
triage_attempts: 0
priority: discuss
origin_cycle_id: "0255"
---

The `RATE_LIMIT_PATTERNS` array includes the bare string `"429"`, matched as a substring anywhere in `(stderr + stdout).toLowerCase()` when `exitCode === 1`. Any tool that exits 1 and emits output containing the digit sequence 4-2-9 — a line number, a byte count, an identifier, an HTTP code in an unrelated error — will be classified as rate-limited.

The cost of a false positive here is non-trivial: when `isRateLimitError` is eventually wired into exec modules and the run-cycle pause/retry loop, a false positive triggers a backoff wait and retry instead of a terminal failure propagation. This wastes cycle time and can mask real hard failures.

Consider tightening the pattern: `"http 429"`, `"status 429"`, `"status: 429"`, `"code 429"`, or a regex word boundary `\b429\b`. The other two patterns (`"rate limit"` and `"too many requests"`) are semantically unambiguous and pose no similar risk.
