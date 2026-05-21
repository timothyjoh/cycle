---
id: refl-0202-claude-md-per-file-floors-list-missing-e
source: reflection
title: CLAUDE.md per-file floors list missing engine-lock.ts 100% floor
added_at: "2026-05-21T04:49:53.793Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0202"
---

The `Coverage policy` section of CLAUDE.md lists per-file floors explicitly (line 37), but `src/engine/engine-lock.ts` — added at a 100% floor to `scripts/coverage-gate.mjs` this cycle — is absent from that list. The Architecture section entry was added correctly, but the Coverage policy prose was not updated to match.

Concrete cost: a future contributor reading CLAUDE.md to understand coverage requirements won't know engine-lock.ts has a floor. More importantly, the instructions say "Extend the `FLOORS` table inside that script to add more floors" — there is no parallel instruction to update CLAUDE.md, so the documentation will drift further as more floors are added.

Fix: add `src/engine/engine-lock.ts` (100%) to the per-file floors list in CLAUDE.md's Coverage policy section.
