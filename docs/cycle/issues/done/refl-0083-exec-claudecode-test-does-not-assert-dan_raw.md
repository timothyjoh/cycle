---
id: refl-0083-exec-claudecode-test-does-not-assert-dan
source: reflection
title: exec-claudecode test does not assert --dangerously-skip-permissions flag presence in args
added_at: "2026-05-16T01:38:46.832Z"
triage_attempts: 0
priority_hint: 6
origin_cycle_id: "0083"
---

REVIEW.md (Pass 2, finding 1) flagged this as advisory: `tests/engine/exec-claudecode.test.ts:17-22` creates a fake `claude` binary that echoes all args via `$@` to stdout, but the assertion only checks `/SPECCED/`. After the correct fix lands, the test would output `SPECCED --dangerously-skip-permissions -p <prompt>` but the regex passes regardless of whether the flag is present.

This means a future regression that drops the flag would pass the test suite silently — exactly the failure mode already experienced across 4 cycles.

Fix: add an assertion `assert.match(r.stdout, /--dangerously-skip-permissions/)` to test 1 in `tests/engine/exec-claudecode.test.ts`. Low overhead, high signal. Should be part of the same cycle that applies the exec-claudecode.ts fix.
