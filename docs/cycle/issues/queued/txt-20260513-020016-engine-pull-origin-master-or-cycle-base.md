---
id: txt-20260513-020016-engine-pull-origin-master-or-cycle-base
source: text
title: "engine: pull origin/master (or CYCLE_BASE) between cycles after checkout-back, before creating the next cycle's branch. Cycle 0008 added checkout-back to base but cycle 0009 still branched from a stale master (the previous cycle's branch tip got merged remotely but local master wasn't refreshed), causing PR #11 to be CONFLICTING and requiring manual cherry-pick + new PR (#12) to land. Fix in src/engine/run-cycle.ts: after the checkout-back, run 'git fetch origin <CYCLE_BASE> && git merge --ff-only FETCH_HEAD' (or equivalent) before allocating the next cycle's branch. Test: simulate two sequential cycles touching the same file; assert second cycle's branch starts from updated master tip, not the first cycle's branch."
added_at: 2026-05-13T02:00:16.805Z
triage_attempts: 0
---

engine: pull origin/master (or CYCLE_BASE) between cycles after checkout-back, before creating the next cycle's branch. Cycle 0008 added checkout-back to base but cycle 0009 still branched from a stale master (the previous cycle's branch tip got merged remotely but local master wasn't refreshed), causing PR #11 to be CONFLICTING and requiring manual cherry-pick + new PR (#12) to land. Fix in src/engine/run-cycle.ts: after the checkout-back, run 'git fetch origin <CYCLE_BASE> && git merge --ff-only FETCH_HEAD' (or equivalent) before allocating the next cycle's branch. Test: simulate two sequential cycles touching the same file; assert second cycle's branch starts from updated master tip, not the first cycle's branch.
