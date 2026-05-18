---
id: refl-0049-loadraws-per-raw-isolation-gap-one-bad-r
title: "Isolate loadRaws failures per-file: surface structured event, process surviving raws"
workflow: feature
depends_on: [refl-0049-loadraws-faults-test-mis-named-exercises]
triaged_at: "2026-05-14T18:00:25.966Z"
source: triage
---
## Context

`src/engine/triage.ts:303-313` `loadRaws` reads every raw and throws on the first `readFile`/`parseFrontmatter` failure, aborting the entire triage pass. SPEC §Requirements for cycle 0049 stated *"surviving raws still processed; failing raw surfaces a structured event"* — current code does not honor that. Cycle 0049 Test 6a (`tests/engine/triage.faults.test.ts:344`) currently pins the rejecting behavior via `assert.rejects(/no frontmatter/)`; BUILD.md explicitly deferred the isolation refactor per SPEC §Out-of-Scope (no catch-clause refactoring).

A single malformed `refl-XXXX-*.md` raw — exactly the kind of artifact `ingestReflection`'s parse-error escalation now drops into `raw/` (`refl-<cycleId>-parse-error.md` from cycle 0046) — aborts every other raw in the same pass and emits `engine.paused {reason:"all_triage_failed"}` even when 19 of 20 raws were fine. Operators have to manually quarantine the bad raw before the queue can drain.

## Scope

- Refactor `loadRaws` in `src/engine/triage.ts` to catch per-file (`readFile`/`parseFrontmatter`) errors instead of letting the first failure abort the whole pass.
- For each failing raw emit a structured `triage.raw.load_error {raw_id, error}` event (error capped consistent with existing event-size discipline — head-kept truncation, e.g. 2000 chars).
- Return surviving raws so the rest of the triage pass proceeds normally.
- Update Test 6a (`tests/engine/triage.faults.test.ts:344`) to assert the new isolation contract: one malformed raw + one valid raw → valid raw is processed end-to-end, malformed raw surfaces `triage.raw.load_error`, no `engine.paused` from this path alone.
- Add coverage for: (a) all raws fail load → still results in `engine.paused {reason:"all_triage_failed"}` (or chosen equivalent — pin behavior in test), (b) mixed success/failure → success path proceeds, failure surfaces event.

## Coordination

This touches the same file/region as `[[refl-0049-triage-ts-605-606-and-632-633-uncovered]]` (mock.method / DI seam discussion for triage internals) and lands after `[[refl-0049-loadraws-faults-test-mis-named-exercises]]` (mis-named test fixes its own ENOENT coverage first so the rename / isolation refactor here doesn't tangle two test changes).

## Acceptance

- `loadRaws` no longer throws when a single raw fails to parse; surviving raws flow through to the agent loop.
- New `triage.raw.load_error {raw_id, error}` event is emitted exactly once per failing raw and recorded in `.cycle/log.jsonl`.
- Test 6a is updated to pin the isolation contract (assertion of event emission + survivor processing), not the prior abort behavior.
- `npm run test:coverage` passes; `triage.ts` per-file line floor (≥95%) holds.
- Coverage gate (`scripts/coverage-gate.mjs`) green.
