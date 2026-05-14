---
id: refl-0048-sync-defaults-guard-logic-sits-in-covera
source: reflection
title: sync-defaults-guard-logic-sits-in-coverage-blindspot
added_at: "2026-05-14T17:22:34.922Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0048"
---

`package.json` test:coverage passes `--test-coverage-exclude='scripts/**'`, so the new ~135 lines of guard logic in `scripts/sync-defaults.mjs` are not instrumented. REVIEW.md called out four real untested branches: `loadState` malformed-JSON fallback (lines 50-58), `discoverPairs` ENOENT (lines 71-75), `--force` on a clean repo (silent-warning path), and prior-state-entry preservation across a skip. The 98.61/92.01/96.32 numbers reported in BUILD.md reflect `src/` only — they do not vouch for the guard.

Why it matters: the guard is data-loss-prevention code. It is exactly the kind of code where an untested branch (e.g. a refactor that deletes `state[to]` on skip, breaking SPEC's 'prior entries left untouched' invariant) silently regresses and is only discovered by a second 0046-style incident.

Suggested direction: either drop the `scripts/**` exclusion (the new test already exercises the script E2E via spawn) and let real coverage numbers surface gaps, or add targeted spawn-based tests for the four named branches. Prefer the former — the exclusion was a holdover from when `scripts/` held only build/bundle glue.
