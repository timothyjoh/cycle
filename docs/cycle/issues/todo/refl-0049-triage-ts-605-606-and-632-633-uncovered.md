---
id: refl-0049-triage-ts-605-606-and-632-633-uncovered
title: Cover triage.ts unlink-rollback catches (605-606, 632-633) via fs.promises.unlink fault injection
workflow: feature
depends_on: [refl-0049-loadraws-per-raw-isolation-gap-one-bad-r]
triaged_at: "2026-05-14T18:02:06.941Z"
source: triage
---
Close the last per-file coverage hole in `src/engine/triage.ts`.

## Context

After cycle 0049, two rollback-failure catch blocks remain uncovered:

- `applyRaw` unlink-todo rollback catch at `src/engine/triage.ts:605-606` — fires when the outer `rename(raw/<id>.md → done/<id>_raw.md)` succeeded but the cleanup `fs.promises.unlink(todoPath)` then throws (ENOSPC, EACCES, EBUSY, etc.).
- `atomicWrite` tmp-cleanup unlink catch at `src/engine/triage.ts:632-633` — fires when an earlier step inside `atomicWrite` already threw and the best-effort `fs.promises.unlink(tmpPath)` cleanup *also* throws.

Both guard the only writer that mutates `tbd.jsonl` and moves files out of `raw/`. Per-file floor `src/engine/triage.ts ≥ 95%` is currently 99.72%, so the gate is satisfied — but these are *the* last lines that could leave the queue half-mutated under unlink errors. Untested today only because cycle 0049's PLAN/SPEC explicitly chose against introducing a one-off `mock.method`-style fs fault-injection convention for a single cycle.

## Why this bundles with the loadRaws isolation work

[[refl-0049-loadraws-per-raw-isolation-gap-one-bad-r]] is the first cycle that is forced to introduce a per-file fs fault-injection seam (the loadRaws isolation gap can only be tested by making one specific raw's `fs.promises.readFile` throw while the others succeed). That cycle has to pick a codebase-wide convention — either `t.mock.method(fs.promises, …)` or a `TriageDeps.<fn>Override` DI shim — and ship it as precedent.

Land these two unlink-catch tests in the **same** cycle (this one, sequenced immediately after) so the chosen convention has its second adopter on day one and future cycles inherit a real precedent rather than a single-use seam.

## Acceptance

- Two new tests added in `tests/engine/triage.faults.test.ts` (or wherever the loadRaws isolation cycle landed its fault-injection helpers), one per catch block:
  1. `applyRaw` rollback-unlink catch (605-606): rename succeeds, then `fs.promises.unlink(todoPath)` throws; the catch is exercised, the error is swallowed (or logged per existing behavior), and the queue/file-system state is asserted to be the same as the success path. No `tbd.jsonl` half-mutation.
  2. `atomicWrite` tmp-cleanup catch (632-633): a step inside the try throws, then `fs.promises.unlink(tmpPath)` also throws; the inner catch is exercised and the original (outer) error still propagates to the caller unchanged.
- Fault injection uses whichever convention [[refl-0049-loadraws-per-raw-isolation-gap-one-bad-r]] establishes. Do **not** invent a third style; if that cycle picks `t.mock.method`, use `t.mock.method` here; if it picks a `TriageDeps.unlinkOverride` shim, extend that shim. The whole point of bundling is convention consistency.
- `npm run test:coverage` reports `src/engine/triage.ts` at 100% line. LCOV block shows `DA:605` / `DA:606` / `DA:632` / `DA:633` all with non-zero hit counts. Per-file gate floor unchanged at ≥ 95% (no broadening).
- No production-code changes to the rollback-catch shape (logging strategy, error wrapping, error type) beyond what the chosen DI seam mechanically requires.

## Out-of-scope

- Refactoring the rollback semantics themselves (different error-handling policy, structured event emission on rollback failure, etc.). This is a pure coverage cycle.
- Adding new per-file floors. `FLOORS` in `scripts/coverage-gate.mjs` remains the single source of truth and is not extended by this cycle.
- Introducing a *new* fs fault-injection convention. If [[refl-0049-loadraws-per-raw-isolation-gap-one-bad-r]] has not yet landed, this cycle is blocked on it — that's what `depends_on` encodes.
