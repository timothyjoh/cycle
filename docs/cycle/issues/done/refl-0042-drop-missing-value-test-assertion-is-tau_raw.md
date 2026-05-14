---
id: refl-0042-drop-missing-value-test-assertion-is-tau
source: reflection
title: drop-missing-value-test-assertion-is-tautological
added_at: "2026-05-14T05:11:44.219Z"
triage_attempts: 0
priority_hint: 3
origin_cycle_id: "0042"
---

`tests/cli/parse-args.test.ts:89` asserts the `--priority` (no value) rejection only via `/drop:/`. That regex matches any error wrapped with the `drop:` prefix — including the unrelated `drop requires task text` path — so the test passes even if the missing-value branch silently regresses to a different error message. The review (REVIEW.md §Adversarial Test Review, finding 1) flagged this as a weak assertion; FIX.md was a no-op because REVIEW.md verdict was PASS and no MUST-FIX.md was emitted.

Tighten to the actual wrapped node:util message, e.g. `/usage: cycle drop/` or `/Option '--priority'.*missing/i`. One-line change; keeps the assertion paying rent.
