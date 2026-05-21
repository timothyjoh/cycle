---
id: refl-0218-argv-order-for-append-system-prompt-unas
source: reflection
title: argv-order for --append-system-prompt unasserted — flag presence tested but not position relative to -p
added_at: "2026-05-21T10:40:38.491Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0218"
---

The two new tests in `exec-claudecode.test.ts` verify that `--append-system-prompt` and its value appear somewhere in argv, but do not assert their position relative to `-p`. The claude CLI may require `--append-system-prompt <value>` to precede `-p <prompt>` to be parsed correctly. If a future refactor reorders argv construction, the tests stay green while the flag silently stops working.

Add an assertion that checks the index of `--append-system-prompt` is strictly less than the index of `-p`, e.g. `expect(argv.indexOf('--append-system-prompt')).toBeLessThan(argv.indexOf('-p'))`.
