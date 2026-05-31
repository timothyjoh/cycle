---
id: refl-0013-register-structural-invariant-pinning-si
source: reflection
title: register structural invariant pinning single terminal-failure bookkeeping impl
added_at: 2026-05-31T20:56:53.093Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0013"
---

This cycle extracted the triplicated terminal-failure bookkeeping into `recordTerminalFailure` precisely to kill the drift hazard where the same accounting lived in three places. BUILD.md explicitly notes the optional follow-up was not done: "a future cycle could register such an invariant in `scripts/structural-invariants.mjs` to lock in the de-duplication mechanically." Nothing currently prevents a future edit from re-inlining `consecutiveFailures += 1` / `failedCycles.push(...)` at one of the call sites and silently re-introducing the exact drift this cycle fought.

File a follow-up to add an `INVARIANTS`-table rule asserting there is exactly one implementation of the bookkeeping sequence (e.g. `consecutiveFailures += 1` plus `failedCycles.push` should appear only in the helper and the out-of-scope resume block). This makes the de-duplication self-enforcing rather than convention-only, matching the repo's stated structural-invariants policy.
