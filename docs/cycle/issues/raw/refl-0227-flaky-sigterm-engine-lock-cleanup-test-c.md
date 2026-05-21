---
id: refl-0227-flaky-sigterm-engine-lock-cleanup-test-c
source: reflection
title: flaky SIGTERM engine-lock cleanup test causes intermittent CI failures
added_at: "2026-05-21T15:05:32.564Z"
triage_attempts: 0
priority_hint: 7
origin_cycle_id: "0227"
---

The test at `tests/cli/engine-lock-integration.test.ts:209` ("SIGTERM → supervisor exits, lock cleaned up") failed during cycle 0227's review run with `AssertionError: lock should be absent after SIGTERM`. It is a timing-sensitive PID-lock cleanup test introduced in cycle 0202 and unrelated to cycle 0227's diff. The failure is intermittent — BUILD.md records 663/0 but the review runner observed the failure.

A flaky test in this area is high-risk: it can mask real regressions in `engine-lock.ts` (which is required at 100% floor) and trigger false CI alerts that train reviewers to ignore failures. Investigate the cleanup delay assumptions; the fix is likely a deterministic signal-to-cleanup handshake or a short poll loop rather than a fixed sleep, consistent with the no-sleep policy in subprocess tests elsewhere in the suite.
