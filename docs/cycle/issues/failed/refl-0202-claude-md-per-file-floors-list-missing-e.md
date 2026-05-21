---
id: refl-0202-claude-md-per-file-floors-list-missing-e
title: CLAUDE.md per-file floors list missing engine-lock.ts 100% floor
workflow: feature
depends_on: []
triaged_at: "2026-05-21T04:53:04.758Z"
source: triage
failed_at: "2026-05-21T05:25:55.751Z"
failed_step: build
failed_attempts: 3
last_cycle_id: "0204"
---
## Problem

`CLAUDE.md`'s Coverage policy section lists per-file floors explicitly but is missing `src/engine/engine-lock.ts` (100%), which was added to `scripts/coverage-gate.mjs` during cycle 0202. The Architecture section was updated correctly in that cycle, but the Coverage policy prose was not.

A future contributor reading `CLAUDE.md` to understand coverage requirements will not know `engine-lock.ts` has a 100% floor. The existing instructions say "Extend the `FLOORS` table inside that script to add more floors" — there is no parallel instruction to update `CLAUDE.md`, so the list will drift further as more floors are added.

## Fix

Add `src/engine/engine-lock.ts` (100%) to the per-file floors list in the Coverage policy section of `CLAUDE.md`, matching the format of adjacent entries.

## Acceptance criteria

- `CLAUDE.md` Coverage policy section lists `src/engine/engine-lock.ts` (100%) alongside the other per-file floors.
- Entry format matches adjacent entries (e.g. `src/engine/path-utils.ts` (100%)).
- No other content in `CLAUDE.md` is changed.
- `npm test` passes.
