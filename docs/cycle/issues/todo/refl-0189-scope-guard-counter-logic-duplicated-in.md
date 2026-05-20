---
id: refl-0189-scope-guard-counter-logic-duplicated-in
title: Extract shared scope-guard violation helper to eliminate verbatim duplication in src/cli.ts
workflow: feature
depends_on: []
triaged_at: "2026-05-20T01:34:47.765Z"
source: triage
---
## Problem

The scope-guard violation block appears verbatim twice in `src/cli.ts`:

- Inside `runResumeOnce` (~line 364): increments `scopeGuardViolations[cycleId]`, emits `engine.paused`, returns when count >= 2
- Inside the main `while (!halted)` drain loop (~line 480): identical logic, breaks instead of returns

The `delete scopeGuardViolations[cycleId]` on successful commit is also duplicated. Any change to the threshold, the `engine.paused` payload shape, or the reset semantics must be made in both places in sync — a maintenance hazard.

## Goal

Extract a helper (e.g. `handleScopeGuardViolation(cycleId: string, blockedFiles: string[], emit: EmitFn): boolean`) that encapsulates the increment, threshold check, and `engine.paused` emit. Both call sites replace the 12-line block with a single call. Place the deletion of the counter on successful commit in a single shared location as well.

## Acceptance Criteria

- [ ] Helper extracted; both `runResumeOnce` and the drain loop call sites use it
- [ ] Threshold value (`>= 2`), `engine.paused` event shape, and counter reset logic each appear in exactly one place
- [ ] All existing scope-guard-loop tests pass unchanged — behavior must not change
- [ ] `npm run test:coverage` passes and per-file coverage floors are met
- [ ] `npm run check:invariants` passes

## Notes

- Pure refactor — no behavior change
- Helper may live in `src/cli.ts` (private) or a new `src/engine/scope-guard.ts` if it aids isolation testing
- The `engine.paused` emit should stay inside the helper so the invariant is testable in one place
- Source locations as of cycle 0189 commit: `runResumeOnce` ~line 364, drain loop ~line 480
