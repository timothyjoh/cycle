---
id: refl-0042-drop-priority-range-error-omits-default
source: reflection
title: drop-priority-range-error-omits-default-value
added_at: "2026-05-14T05:11:44.219Z"
triage_attempts: 0
priority_hint: 2
origin_cycle_id: "0042"
---

SPEC §Functional says the `drop` usage string surfaced on parse error should document both the `1..10` range and the `3` default. The rejection thrown from `src/cli/parse-args.ts:43-46` reads `--priority must be an integer 1..10 (got "…"); usage: cycle drop "<text>" [--priority N]` — range is implicit in the message, but the `default 3` hint is absent. The wrap of node:util's native error at `src/cli/parse-args.ts:30-34` does include `N is an integer 1..10, default 3`, so the two error paths disagree about how much help they give the user.

Fold `default 3` into the range-error suffix so both paths surface identical guidance. Cosmetic, but it's the kind of inconsistency that compounds if other flags get the same treatment.
