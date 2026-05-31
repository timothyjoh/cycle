---
id: refl-0013-register-structural-invariant-pinning-si
title: Register structural invariant pinning single terminal-failure bookkeeping impl
workflow: feature
depends_on: []
triaged_at: 2026-05-31T21:01:09.981Z
source: triage
priority: medium
---
Cycle 0013 extracted the triplicated terminal-failure bookkeeping into `recordTerminalFailure` (`src/engine/halt-accounting.ts`) to kill the drift hazard where the same accounting lived in three call sites in `src/cli.ts`. BUILD.md flagged the optional follow-up that was not done: registering a structural invariant to lock in the de-duplication mechanically. Nothing currently prevents a future edit from re-inlining `consecutiveFailures += 1` / `failedCycles.push(...)` at a call site and silently re-introducing the exact drift this cycle fought.

Add an `INVARIANTS`-table rule in `scripts/structural-invariants.mjs` asserting there is exactly one implementation of the bookkeeping sequence — i.e. the `consecutiveFailures += 1` increment paired with `failedCycles.push(...)` should appear only inside the `recordTerminalFailure` helper (plus the out-of-scope resume block that legitimately performs its own accounting). Any additional occurrence at a supervisor call site must fail `npm run check:invariants`.

Scope: design the invariant pattern so it matches the real bookkeeping sequence without false positives (account for the resume-block exception), register it in the `INVARIANTS` table, and add/extend the invariant test coverage. This makes the de-duplication self-enforcing rather than convention-only, matching the repo's stated structural-invariants policy in CLAUDE.md. Do not change the runtime bookkeeping behavior — this is a build-time guard only.
