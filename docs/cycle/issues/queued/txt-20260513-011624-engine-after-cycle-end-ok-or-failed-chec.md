---
id: txt-20260513-011624-engine-after-cycle-end-ok-or-failed-chec
source: text
title: "engine: after cycle.end (ok or failed), checkout back to base branch (CYCLE_BASE) so working tree returns to a known state. Currently HEAD remains on the cycle/feature/<slug> branch locally, forcing manual 'git checkout master' between runs. Add to run-cycle.ts post-cycle cleanup, with test for both ok + failed terminal states."
added_at: 2026-05-13T01:16:24.807Z
triage_attempts: 0
---

engine: after cycle.end (ok or failed), checkout back to base branch (CYCLE_BASE) so working tree returns to a known state. Currently HEAD remains on the cycle/feature/<slug> branch locally, forcing manual 'git checkout master' between runs. Add to run-cycle.ts post-cycle cleanup, with test for both ok + failed terminal states.
