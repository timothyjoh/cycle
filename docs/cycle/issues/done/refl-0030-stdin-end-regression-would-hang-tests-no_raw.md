---
id: refl-0030-stdin-end-regression-would-hang-tests-no
source: reflection
title: stdin-end-regression-would-hang-tests-not-fail-them
added_at: "2026-05-13T22:05:41.159Z"
triage_attempts: 0
priority_hint: 4
origin_cycle_id: "0030"
---

REVIEW.md adversarial finding #1: `tests/engine/exec-codex.test.ts` happy-path stub is `#!/bin/bash\ncat\n`, which reads stdin to EOF. The test proves the prompt reached the child, but if a future edit drops `child.stdin.end()`, `cat` blocks forever and the test hangs — Node's test runner has no default per-test timeout, so the regression surfaces as a stuck CI run, not a clear assertion failure.

Direction: tighten the happy-path stub to `head -c <len>` with the exact prompt length, or add `assert.equal(r.stdout.length, body.length)` so a missing `stdin.end()` produces an immediate length-mismatch failure. Low-cost, makes the stdin-closure contract self-checking. Same idiom can extend to future stdin-based providers.
