---
id: refl-0049-triage-ts-605-606-and-632-633-uncovered
source: reflection
title: triage-ts-605-606-and-632-633-uncovered-only-coverable-with-mock-method
added_at: "2026-05-14T17:57:44.963Z"
triage_attempts: 0
priority_hint: 5
origin_cycle_id: "0049"
---

`src/engine/triage.ts:605-606` (`applyRaw` unlink-todo rollback catch) and `:632-633` (`atomicWrite` tmp-cleanup unlink catch) remain the only uncovered lines in `triage.ts` after cycle 0049 — `99.72%` line vs the 95% floor. PLAN Task 2 originally targeted both inner catches; BUILD.md §Deviations dropped them because the only way to make the inner `fs.promises.unlink` throw after the outer rename succeeds is to mock it, and the cycle 0049 PLAN explicitly chose against introducing `node:test` `t.mock.method(fs.promises, "unlink", …)` for a single cycle (the existing tests have zero `mock.method` calls). SPEC §Out-of-Scope (no catch-clause refactoring) also excluded adding a `TriageDeps.unlinkOverride` shim.

Why it matters: both pairs guard rollback-failure paths in the only writer that mutates `tbd.jsonl` and moves files out of `raw/`. They are *the* last lines that could leave the queue half-mutated under unlink errors (ENOSPC, EACCES, EBUSY). Not testing them today is acceptable because the gate floor is satisfied; not testing them ever is a real correctness hole.

Suggested direction: bundle with the next cycle that already touches `triage.ts` for any reason — almost certainly `[[loadraws-per-raw-isolation-gap-one-bad-raw-rejects-whole-pass]]`, which already implies new DI seams or new mocking style. Choose between (a) introducing `t.mock.method(fs.promises, "unlink", …)` as the codebase-wide convention for fs-fault injection, or (b) adding a `TriageDeps.unlinkOverride` shim so production fs calls remain real but tests can inject. Whichever is chosen, ship the convention plus the two missing tests together so future cycles have a precedent.
